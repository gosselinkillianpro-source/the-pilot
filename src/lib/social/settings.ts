/**
 * Réglages du Social Hub (mix éditorial, cadence) — persistés en clé/valeur.
 */

import { inArray } from 'drizzle-orm';
import { DEFAULT_EDITORIAL_MIX, type EditorialMix } from '@/lib/ai/prompts/social-ideas';
import { db } from '@/lib/db';
import { socialSettings } from '@/lib/db/schema';

const KEYS = {
  projets: 'mix_projets',
  pedagogique: 'mix_pedagogique',
  temoignages: 'mix_temoignages',
  mise_avant: 'mix_mise_avant',
  postsPerWeek: 'posts_per_week',
} as const;

export type SocialConfig = { mix: EditorialMix; postsPerWeek: number };

export const DEFAULT_CONFIG: SocialConfig = {
  mix: DEFAULT_EDITORIAL_MIX,
  postsPerWeek: 9,
};

export async function getSocialConfig(): Promise<SocialConfig> {
  const rows = await db
    .select()
    .from(socialSettings)
    .where(inArray(socialSettings.key, Object.values(KEYS)));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = map.get(key);
    const n = v === undefined ? Number.NaN : Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    mix: {
      projets: num(KEYS.projets, DEFAULT_EDITORIAL_MIX.projets),
      pedagogique: num(KEYS.pedagogique, DEFAULT_EDITORIAL_MIX.pedagogique),
      temoignages: num(KEYS.temoignages, DEFAULT_EDITORIAL_MIX.temoignages),
      mise_avant: num(KEYS.mise_avant, DEFAULT_EDITORIAL_MIX.mise_avant),
    },
    postsPerWeek: num(KEYS.postsPerWeek, DEFAULT_CONFIG.postsPerWeek),
  };
}

export async function setSocialConfig(config: SocialConfig): Promise<void> {
  const entries: { key: string; value: string }[] = [
    { key: KEYS.projets, value: String(config.mix.projets) },
    { key: KEYS.pedagogique, value: String(config.mix.pedagogique) },
    { key: KEYS.temoignages, value: String(config.mix.temoignages) },
    { key: KEYS.mise_avant, value: String(config.mix.mise_avant) },
    { key: KEYS.postsPerWeek, value: String(config.postsPerWeek) },
  ];
  for (const e of entries) {
    await db
      .insert(socialSettings)
      .values({ key: e.key, value: e.value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: socialSettings.key,
        set: { value: e.value, updatedAt: new Date() },
      });
  }
}
