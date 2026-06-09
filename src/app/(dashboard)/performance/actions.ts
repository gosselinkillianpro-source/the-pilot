'use server';

import { z } from 'zod';
import { estimateCostEur } from '@/lib/ai/anthropic';
import { logLlmCall } from '@/lib/ai/log-llm';
import { askPilote } from '@/lib/ai/pilote';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { ensureUserRecord } from '@/lib/db/queries/users';

const schema = z.object({ question: z.string().trim().min(3).max(1000) });

export type PiloteActionResult =
  | { ok: true; answer: string; sql: string | null; costEur: number }
  | { ok: false; message: string };

/** Le Pilote : pose une question en langage naturel, réponse calée sur les vraies données (admin). */
export async function askPiloteAction(input: { question: string }): Promise<PiloteActionResult> {
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(input);
  } catch {
    return { ok: false, message: 'Question invalide (entre 3 et 1000 caractères).' };
  }
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin']);
  } catch {
    return { ok: false, message: 'Le Pilote est réservé à l’admin.' };
  }
  await ensureUserRecord(user);

  const res = await askPilote(parsed.question);
  if (!res.ok) {
    await logLlmCall({
      userId: user.id,
      model: 'claude-opus-4-7',
      purpose: 'pilote_query',
      status: 'error',
      errorMessage: res.message,
      inputSummary: parsed.question.slice(0, 200),
    });
    return { ok: false, message: res.message };
  }

  const costEur = estimateCostEur(res.model, res.promptTokens, res.completionTokens);
  await logLlmCall({
    userId: user.id,
    model: res.model,
    purpose: 'pilote_query',
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    latencyMs: res.latencyMs,
    status: 'success',
    inputSummary: parsed.question.slice(0, 200),
    outputSummary: res.answer.slice(0, 200),
  });
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'ai.pilote_query',
    resourceType: 'analytics',
    resourceId: 'pilote',
    metadata: { question: parsed.question.slice(0, 200), sql: res.sql },
  });

  return { ok: true, answer: res.answer, sql: res.sql, costEur };
}
