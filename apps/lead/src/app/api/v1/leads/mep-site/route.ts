import { after, type NextRequest } from 'next/server';
import {
  authenticateSource,
  checkRateLimit,
  clientIp,
  clientUserAgent,
} from '@/lib/api/source-auth';
import { adaptMepSitePayload, mepSitePayloadSchema } from '@/lib/domain/mep-site-adapter';
import { ensureJobsRegistered } from '@/lib/jobs';
import { runJobsNow } from '@/lib/jobs/queue';
import { findLeadByIdempotency, ingestLead, patchLeadAnswers } from '@/lib/leads/ingest';

/**
 * POST /api/v1/leads/mep-site — payload NATIF du diagnostic MonExpertPatrimoine,
 * relayé par /api/lead.php (même domaine que le site) avec `X-Source-Key`,
 * `X-Client-IP` et `X-Client-UA`. Chaque étape validée arrive ici :
 * la première crée le lead, les suivantes complètent ses réponses.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const source = await authenticateSource(req);
  if (!source) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (source.code !== 'mep')
    return Response.json({ ok: false, error: 'wrong_source' }, { status: 403 });

  const ip = clientIp(req);
  const rate = checkRateLimit(`${source.id}:${ip ?? 'inconnue'}`);
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = mepSitePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'payload_invalide', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const receivedAt = new Date();
  const adapted = adaptMepSitePayload(parsed.data, {
    ip,
    userAgent: clientUserAgent(req),
    receivedAt,
  });
  if (adapted.kind === 'ignore') {
    return Response.json({ ok: true, ignored: adapted.reason }, { status: 202 });
  }

  const existing = await findLeadByIdempotency(source.id, adapted.payload.idempotency_key);
  if (existing) {
    const r = await patchLeadAnswers(
      source.id,
      existing.id,
      {
        answers: adapted.payload.answers,
        answers_version: adapted.payload.answers_version ?? null,
        answers_complete: adapted.complete,
        site_score: adapted.payload.site_score ?? null,
      },
      receivedAt,
    );
    if (r.status === 'not_found')
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
    return Response.json({ ok: true, lead_id: existing.id, state: existing.state, updated: true });
  }

  const result = await ingestLead(source, adapted.payload, {
    ip,
    userAgent: clientUserAgent(req),
    receivedAt,
  });
  if (result.status === 'rejected') {
    return Response.json(
      { ok: false, error: result.reason, details: result.details ?? null },
      { status: 422 },
    );
  }
  if (result.status === 'already_exists') {
    return Response.json({
      ok: true,
      lead_id: result.leadId,
      state: result.state,
      duplicate_request: true,
    });
  }
  const ids = result.jobIds;
  after(async () => {
    ensureJobsRegistered();
    const r = await runJobsNow(ids);
    if (r.errors.length) console.error('[lead.mep-site] jobs immédiats', r.errors);
  });
  return Response.json({ ok: true, lead_id: result.leadId, state: result.state }, { status: 201 });
}
