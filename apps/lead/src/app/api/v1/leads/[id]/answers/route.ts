import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateSource } from '@/lib/api/source-auth';
import { answersPatchSchema } from '@/lib/domain/ingest-schema';
import { patchLeadAnswers } from '@/lib/leads/ingest';

/** PATCH /api/v1/leads/{id}/answers — les réponses suivantes du diagnostic (sauvegarde progressive). */
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const source = await authenticateSource(req);
  if (!source) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = answersPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'payload_invalide', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await patchLeadAnswers(source.id, id, parsed.data);
  if (result.status === 'not_found')
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true, lead_id: result.leadId });
}
