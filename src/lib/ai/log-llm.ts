import 'server-only';
import { db } from '@/lib/db';
import { llmCalls } from '@/lib/db/schema';
import { estimateCostEur } from './anthropic';

type LlmStatus = 'success' | 'error' | 'timeout';

export type LogLlmCallInput = {
  userId?: string | null;
  model: string;
  purpose: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  status: LlmStatus;
  errorMessage?: string;
  inputSummary?: string;
  outputSummary?: string;
};

/**
 * Journalise un appel LLM dans la table `llm_calls` (règle #14 — logging exhaustif).
 * Best-effort : un échec d'insertion ne doit jamais casser la fonctionnalité métier,
 * mais on le remonte dans les logs.
 */
export async function logLlmCall(entry: LogLlmCallInput): Promise<void> {
  const promptTokens = entry.promptTokens ?? 0;
  const completionTokens = entry.completionTokens ?? 0;
  const costEur = estimateCostEur(entry.model, promptTokens, completionTokens);

  try {
    await db.insert(llmCalls).values({
      userId: entry.userId ?? null,
      provider: 'anthropic',
      model: entry.model,
      purpose: entry.purpose,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costEur: costEur.toFixed(6),
      latencyMs: entry.latencyMs ?? null,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      inputSummary: entry.inputSummary?.slice(0, 500) ?? null,
      outputSummary: entry.outputSummary?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error('logLlmCall failed:', e instanceof Error ? e.message : e);
  }
}
