/**
 * D'où vient une personne — et donc quelle part du mérite revient au closer.
 *
 * Demande de Killian (4 sept. 2026) : séparer ce qui vient des pubs (code
 * BREACH) de ce qui est venu tout seul. Un inscrit pub, c'est le closer qui
 * fait tout ; un parrainé ou un invité arrivait déjà avec une idée du montant.
 *
 * Même lecture que la page Ads (`ads-acquisition.ts`) :
 *   - code pub (SEVEN-BREACH*, *VIP*) → pub ;
 *   - un autre code saisi → partenaire (CGP / réseau) ;
 *   - parrainé par un investisseur (breach_level ≥ 1, ou un parrain hors
 *     réseau) → parrainage ;
 *   - BREACH direct sans code (niveau 0 : le funnel pub écrit lui-même le
 *     parrain « SEVEN BREACH ») → pub ;
 *   - vrai CGP tiers → partenaire ;
 *   - sinon → venu seul (invitation admin, organique).
 *
 * Module pur, testé.
 */

export type InvestorOrigin = 'ads' | 'referral' | 'partner' | 'other';

export type OriginInput = {
  bonusCode: string | null;
  breachLevel: number | null;
  parentSahId: string | null;
  cgpName: string | null;
  cgpNetwork: string | null;
};

export type OriginMeta = {
  key: InvestorOrigin;
  label: string;
  hint: string;
  badge: string;
};

export const ORIGINS: OriginMeta[] = [
  {
    key: 'ads',
    label: 'Pub',
    hint: 'Code BREACH / VIP ou funnel pub : le closer fait tout',
    badge: 'badge-ai',
  },
  {
    key: 'referral',
    label: 'Parrainage',
    hint: 'Invité par un investisseur : arrivait déjà avec une idée',
    badge: 'badge-brand',
  },
  {
    key: 'other',
    label: 'Venu seul',
    hint: 'Invitation ou organique : sans code ni parrain',
    badge: 'badge-neutral',
  },
  {
    key: 'partner',
    label: 'Partenaire',
    hint: 'Code ou CGP partenaire : suivi par son conseiller',
    badge: 'badge-warning',
  },
];

const DEFAULT_META: OriginMeta = {
  key: 'other',
  label: 'Venu seul',
  hint: 'Invitation ou organique : sans code ni parrain',
  badge: 'badge-neutral',
};

export function originMeta(origin: InvestorOrigin): OriginMeta {
  return ORIGINS.find((o) => o.key === origin) ?? DEFAULT_META;
}

/** Même règle que `classifyCode` (page Ads) : SEVEN-BREACH* et *VIP* sont des codes pub. */
export function isAdCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  return c.startsWith('SEVEN-BREACH') || c.includes('VIP');
}

/** Un CGP « maison » (BREACH, Guillaume Gosselin) marque un lead pub ; un autre nom est un tiers. */
export function isThirdPartyCgp(cgpName: string | null, cgpNetwork: string | null): boolean {
  const values = [cgpName, cgpNetwork].filter((v): v is string => !!v && v.trim() !== '');
  if (values.length === 0) return false;
  return !values.some((v) => /breach|gosselin/i.test(v));
}

export function investorOrigin(i: OriginInput): InvestorOrigin {
  const code = i.bonusCode?.trim() ?? '';
  if (code) return isAdCode(code) ? 'ads' : 'partner';
  if (i.breachLevel != null && i.breachLevel >= 1) return 'referral';
  if (i.breachLevel === 0) return 'ads';
  if (isThirdPartyCgp(i.cgpName, i.cgpNetwork)) return 'partner';
  if (i.parentSahId) return 'referral';
  return 'other';
}

/** Les deux familles que Killian veut voir séparées : pubs, et tout le reste. */
export type OriginGroup = 'ads' | 'other';

export function originGroup(origin: InvestorOrigin): OriginGroup {
  return origin === 'ads' ? 'ads' : 'other';
}

export const ORIGIN_GROUP_LABELS: Record<OriginGroup, string> = {
  ads: 'Pubs',
  other: 'Venus autrement',
};
