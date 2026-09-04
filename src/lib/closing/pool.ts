/**
 * Le pool commun — les personnes que personne ne suit encore, servies dans
 * l'ordre décidé par Killian le 4 septembre 2026 :
 *
 *   1. breach_new  Nouveaux inscrits venus des pubs (code BREACH) — toujours
 *                  en premier.
 *   2. other_new   Autres nouveaux inscrits (parrainage, organique…).
 *   3. hot         Moments chauds de la base : premier investissement à
 *                  remercier, argent qui dort sur le wallet, remboursement
 *                  proche.
 *   4. base        Le reste de la base historique (KYC à débloquer, jamais
 *                  investi, relation) — proposé seulement quand il n'y a rien
 *                  de plus urgent.
 *
 * Exclus du pool : les personnes déjà suivies par un closer, et les inscrits
 * amenés par un CGP partenaire tiers (ce n'est pas à Seven de les appeler
 * par-dessus leur conseiller).
 *
 * Module pur : il ne fait que ranger des lignes déjà scorées.
 */

export type PoolTier = 'breach_new' | 'other_new' | 'hot' | 'base';

export type PoolTierMeta = { key: PoolTier; label: string; hint: string };

export const POOL_TIERS: PoolTierMeta[] = [
  {
    key: 'breach_new',
    label: 'Nouveaux · pubs',
    hint: 'Inscrits via un code BREACH — à rappeler sous 5 minutes si possible',
  },
  {
    key: 'other_new',
    label: 'Nouveaux · autres sources',
    hint: 'Parrainage, organique, partenaires : à rappeler sous 48 h',
  },
  {
    key: 'hot',
    label: 'Moments chauds',
    hint: 'Premier investissement à remercier, argent qui dort, remboursement proche',
  },
  {
    key: 'base',
    label: 'Base à travailler',
    hint: "Seulement quand il n'y a rien de plus urgent : KYC, jamais investi, relation",
  },
];

/** Files du scoring qui valent « moment chaud » (buckets 2, 3, 4). */
const HOT_BUCKETS = new Set([2, 3, 4]);

/**
 * Un CGP « maison » (BREACH, Guillaume Gosselin) marque un lead pub ; un autre
 * nom désigne un partenaire tiers dont on ne démarche pas les clients.
 * Même convention que l'attribution pub (`ads-acquisition.ts`).
 */
export function isThirdPartyCgp(cgpName: string | null, cgpNetwork: string | null): boolean {
  const values = [cgpName, cgpNetwork].filter((v): v is string => !!v && v.trim() !== '');
  if (values.length === 0) return false;
  return !values.some((v) => /breach|gosselin/i.test(v));
}

export type PoolCandidate = {
  assignedCloserId: string | null;
  isBreach: boolean;
  cgpName: string | null;
  cgpNetwork: string | null;
  scored: { isNewLead: boolean; queueBucket: number };
};

export type Pool<T extends PoolCandidate> = Record<PoolTier, T[]>;

export function poolTierOf(row: PoolCandidate): PoolTier {
  if (row.scored.isNewLead) return row.isBreach ? 'breach_new' : 'other_new';
  if (HOT_BUCKETS.has(row.scored.queueBucket)) return 'hot';
  return 'base';
}

/**
 * Range les lignes libres (sans closer) par niveau, en conservant l'ordre
 * d'entrée (déjà trié par la file d'appels).
 */
export function buildPool<T extends PoolCandidate>(rows: T[]): Pool<T> {
  const pool: Pool<T> = { breach_new: [], other_new: [], hot: [], base: [] };
  for (const row of rows) {
    if (row.assignedCloserId) continue;
    if (isThirdPartyCgp(row.cgpName, row.cgpNetwork)) continue;
    pool[poolTierOf(row)].push(row);
  }
  return pool;
}

/** Nombre de personnes servies avant la base, pour dire « rien de plus urgent ». */
export function urgentCount<T extends PoolCandidate>(pool: Pool<T>): number {
  return pool.breach_new.length + pool.other_new.length + pool.hot.length;
}
