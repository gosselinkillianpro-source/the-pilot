import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY is not set — Anthropic calls will fail at runtime');
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

export const ANTHROPIC_MODELS = {
  complex: 'claude-opus-4-7',
  fast: 'claude-haiku-4-5-20251001',
} as const;

const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

export function estimateCostEur(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MTOK[model];
  if (!pricing) return 0;
  const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  return costUsd * 0.92;
}
