import { after, type NextRequest } from 'next/server';
import {
  authenticateSource,
  checkRateLimit,
  clientIp,
  clientUserAgent,
} from '@/lib/api/source-auth';
import { ensureJobsRegistered } from '@/lib/jobs';
import { runJobsNow } from '@/lib/jobs/queue';
import { ingestLead } from '@/lib/leads/ingest';

/**
 * POST /api/v1/leads — réception canonique (section 4.1).
 * Authentifié par `X-Source-Key`. Idempotent via `idempotency_key`.
 * 201 = créé, 200 = déjà reçu (même réponse), 422 = rejeté, 401 = clé absente/invalide.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const source = await authenticateSource(req);
  if (!source) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

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

  const result = await ingestLead(source, body, {
    ip,
    userAgent: clientUserAgent(req),
    receivedAt: new Date(),
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

  // L'immédiat (alerte, CAPI Lead) part après la réponse : le site n'attend pas.
  const ids = result.jobIds;
  after(async () => {
    ensureJobsRegistered();
    const r = await runJobsNow(ids);
    if (r.errors.length) console.error('[lead.ingest] jobs immédiats', r.errors);
  });

  return Response.json({ ok: true, lead_id: result.leadId, state: result.state }, { status: 201 });
}
