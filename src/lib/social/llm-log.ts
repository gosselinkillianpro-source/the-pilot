/**
 * Logging des appels LLM du Social Hub (règle CLAUDE.md #14 : logging exhaustif).
 * Insère une ligne dans llm_calls. Best-effort : ne fait jamais échouer l'appel métier.
 */

import { db } from '@/lib/db';
import { llmCalls } from '@/lib/db/schema';

export async function logLlmCall(entry: {
  userId: string | null;
  provider: string;
  model: string;
  purpose: string;
  status: 'success' | 'error' | 'timeout';
  latencyMs: number;
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.insert(llmCalls).values({
      userId: entry.userId,
      provider: entry.provider,
      model: entry.model,
      purpose: entry.purpose,
      status: entry.status,
      latencyMs: entry.latencyMs,
      inputSummary: entry.inputSummary?.slice(0, 500),
      outputSummary: entry.outputSummary?.slice(0, 500),
      errorMessage: entry.errorMessage?.slice(0, 1000),
    });
  } catch (e) {
    // Logging ne doit jamais casser le flux métier
    console.error('[llm-log] insertion échouée', e instanceof Error ? e.message : e);
  }
}
