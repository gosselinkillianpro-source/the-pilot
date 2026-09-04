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
    label: 'À remercier, argent à placer, remboursements proches',
    hint: 'Premier investissement récent, wallet alimenté non investi, projet qui rembourse sous 30 jours',
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

/* ============================================================
   AFFICHAGE — des groupes qui disent POURQUOI on appelle
   ============================================================ */

export type PoolGroup<T> = {
  key: string;
  /** Dans les mots du closer : la raison d'appeler ces personnes. */
  label: string;
  hint: string;
  /** Servi avant la base historique. */
  urgent: boolean;
  rows: T[];
};

/**
 * Libellés du pool. Retour de Killian (4 sept. 2026) : « Moments chauds » ne
 * veut rien dire, le closer doit savoir pourquoi il appelle chaque groupe.
 * Un groupe = une raison, une phrase de consigne.
 */
const GROUP_LABELS: Record<string, { label: string; hint: string }> = {
  breach_new: {
    label: 'Inscrits via les pubs',
    hint: 'À rappeler sous 5 minutes : finaliser l’inscription ou le KYC, cerner le projet, proposer un RDV.',
  },
  other_new: {
    label: 'Nouveaux inscrits · parrainage, organique',
    hint: 'À rappeler sous 48 h : même objectif que les pubs.',
  },
  bucket_2: {
    label: 'Viennent d’investir · à remercier',
    hint: 'Premier investissement il y a moins de 15 jours : créer le lien, vérifier que tout s’est bien passé, proposer le parrainage.',
  },
  bucket_3: {
    label: 'Argent qui dort sur le wallet',
    hint: 'Solde disponible non investi depuis plusieurs jours : aider à le placer maintenant.',
  },
  bucket_4: {
    label: 'Remboursement proche · proposer un réinvestissement',
    hint: 'Un projet rembourse dans les 30 jours : le meilleur moment pour réinvestir.',
  },
  bucket_5: {
    label: 'KYC à finir',
    hint: 'Compte créé, pièce d’identité pas validée : débloquer la capacité à investir.',
  },
  bucket_6: {
    label: 'Inscription à finir',
    hint: 'Compte commencé sans être terminé : comprendre le blocage, accompagner. Pas de vente.',
  },
  bucket_7: {
    label: 'KYC validé, jamais investi · inscrits récents',
    hint: 'Peuvent investir, n’ont rien souscrit : présenter un projet.',
  },
  bucket_8: {
    label: 'KYC validé, jamais investi · anciens',
    hint: 'Inscrits depuis plus de 90 jours : réengager s’il y a un signal, sinon laisser l’e-mail faire.',
  },
  bucket_9: {
    label: 'Relation client',
    hint: 'Ont investi, pas d’échéance proche : entretenir la relation, jamais au détriment des autres.',
  },
};

function byBucket<T extends PoolCandidate>(rows: T[]): [number, T[]][] {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const list = map.get(r.scored.queueBucket) ?? [];
    list.push(r);
    map.set(r.scored.queueBucket, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Le pool en groupes affichables, dans l'ordre de service : pubs, autres
 * nouveaux, puis chaque raison « chaude » (remercier, argent à placer,
 * remboursement), puis la base par raison. Les groupes vides sont omis.
 */
export function groupPool<T extends PoolCandidate>(pool: Pool<T>): PoolGroup<T>[] {
  const groups: PoolGroup<T>[] = [];
  const add = (key: string, rows: T[], urgent: boolean) => {
    if (rows.length === 0) return;
    const meta = GROUP_LABELS[key] ?? { label: key, hint: '' };
    groups.push({ key, label: meta.label, hint: meta.hint, urgent, rows });
  };
  add('breach_new', pool.breach_new, true);
  add('other_new', pool.other_new, true);
  for (const [bucket, rows] of byBucket(pool.hot)) add(`bucket_${bucket}`, rows, true);
  for (const [bucket, rows] of byBucket(pool.base)) add(`bucket_${bucket}`, rows, false);
  return groups;
}
