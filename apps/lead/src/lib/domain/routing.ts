/**
 * Routage (section 4.5) — pure. Le service fournit les candidats avec leurs
 * compteurs ; ici on ne fait que filtrer et trier.
 *
 * 1. Acheteurs actifs, non en pause, pour qui le lead est qualifié.
 * 2. Retrait de ceux qui ont atteint leur plafond jour / semaine, ou dont le
 *    pack prépayé est épuisé.
 * 3. Tri par priorité croissante, puis équité : le moins récemment servi.
 */

export type RoutingCandidate = {
  buyerId: string;
  name: string;
  active: boolean;
  pausedUntil: Date | null;
  priority: number;
  dailyCap: number | null;
  weeklyCap: number | null;
  dailyCount: number;
  weeklyCount: number;
  /** `null` = pas de pack prépayé actif (facturation mensuelle) ; sinon RDV restants. */
  packRemaining: number | null;
  lastRoutedAt: Date | null;
};

export type ExclusionReason =
  | 'inactif'
  | 'en_pause'
  | 'non_qualifie'
  | 'plafond_jour'
  | 'plafond_semaine'
  | 'pack_epuise';

export type RoutingResult = {
  eligible: RoutingCandidate[];
  excluded: { candidate: RoutingCandidate; reason: ExclusionReason }[];
};

export function rankCandidates(
  candidates: RoutingCandidate[],
  qualifiedBuyerIds: ReadonlySet<string>,
  now: Date,
): RoutingResult {
  const eligible: RoutingCandidate[] = [];
  const excluded: RoutingResult['excluded'] = [];

  for (const c of candidates) {
    const reason = exclusionReason(c, qualifiedBuyerIds, now);
    if (reason) excluded.push({ candidate: c, reason });
    else eligible.push(c);
  }

  eligible.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ta = a.lastRoutedAt?.getTime() ?? 0;
    const tb = b.lastRoutedAt?.getTime() ?? 0;
    return ta - tb;
  });

  return { eligible, excluded };
}

function exclusionReason(
  c: RoutingCandidate,
  qualified: ReadonlySet<string>,
  now: Date,
): ExclusionReason | null {
  if (!c.active) return 'inactif';
  if (c.pausedUntil && c.pausedUntil > now) return 'en_pause';
  if (!qualified.has(c.buyerId)) return 'non_qualifie';
  if (c.dailyCap !== null && c.dailyCount >= c.dailyCap) return 'plafond_jour';
  if (c.weeklyCap !== null && c.weeklyCount >= c.weeklyCap) return 'plafond_semaine';
  if (c.packRemaining !== null && c.packRemaining <= 0) return 'pack_epuise';
  return null;
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  inactif: 'inactif',
  en_pause: 'en pause',
  non_qualifie: 'critères obligatoires non remplis',
  plafond_jour: 'plafond journalier atteint',
  plafond_semaine: 'plafond hebdomadaire atteint',
  pack_epuise: 'pack épuisé',
};
