import type { AcquisitionCounts, AdPlatform } from '@/lib/db/queries/ads-acquisition';

/**
 * Logique PURE du coût d'acquisition croisé (pas de DB, pas de server-only) :
 * assemble dépense par régie + comptages attribués en lignes affichables.
 * Séparée de `blended.ts` pour être testable unitairement.
 */

export type BlendedMetrics = {
  cpa: number | null; // dépense / inscrit
  cpi: number | null; // dépense / inscrit complet (profil + KYC)
  costPerInvestor: number | null; // dépense / investisseur
  avgTicket: number | null; // investissement moyen
  profitRatio: number | null; // investissement moyen / coût par investisseur (>1 = rentable)
};

export function compute(spend: number, c: AcquisitionCounts): BlendedMetrics {
  const cpa = spend > 0 && c.inscrits > 0 ? spend / c.inscrits : null;
  const cpi = spend > 0 && c.complets > 0 ? spend / c.complets : null;
  const costPerInvestor = spend > 0 && c.investisseurs > 0 ? spend / c.investisseurs : null;
  const avgTicket = c.investisseurs > 0 ? c.collecte / c.investisseurs : null;
  const profitRatio =
    avgTicket !== null && costPerInvestor !== null && costPerInvestor > 0
      ? avgTicket / costPerInvestor
      : null;
  return { cpa, cpi, costPerInvestor, avgTicket, profitRatio };
}

export function sumCounts(a: AcquisitionCounts, b: AcquisitionCounts): AcquisitionCounts {
  return {
    inscrits: a.inscrits + b.inscrits,
    complets: a.complets + b.complets,
    investisseurs: a.investisseurs + b.investisseurs,
    collecte: a.collecte + b.collecte,
  };
}

const ZERO: AcquisitionCounts = { inscrits: 0, complets: 0, investisseurs: 0, collecte: 0 };

function hasAny(c: AcquisitionCounts): boolean {
  return c.inscrits > 0 || c.complets > 0 || c.investisseurs > 0 || c.collecte > 0;
}

export type PlatformAcq = {
  platform: AdPlatform;
  code: string;
  spend: number;
  counts: AcquisitionCounts;
  metrics: BlendedMetrics;
};

/** Ligne « RDV Calendly + manuels » : attribuée aux ads mais sans dépense propre. */
export type ExtraAcq = {
  label: string;
  counts: AcquisitionCounts;
  metrics: BlendedMetrics; // coûts null (pas de dépense dédiée), ticket moyen réel
};

export type BlendedAcquisition = {
  available: boolean; // au moins une ligne à afficher
  platforms: PlatformAcq[]; // régies avec dépense > 0 sur la période
  extra: ExtraAcq | null; // RDV Calendly + attribution manuelle (hors codes)
  total: { spend: number; counts: AcquisitionCounts; metrics: BlendedMetrics } | null;
  /** TOUT ce qui est attribué ads sur la période (codes + RDV/manuel), même sans dépense. */
  attributed: AcquisitionCounts;
};

export function assembleBlended(
  spendByPlatform: Partial<Record<AdPlatform, number>>,
  countsByPlatform: Record<AdPlatform, AcquisitionCounts>,
  extraCounts: AcquisitionCounts,
  labels: Record<AdPlatform, string>,
): BlendedAcquisition {
  const platforms: PlatformAcq[] = [];
  for (const platform of ['Meta', 'Google'] as const) {
    const spend = spendByPlatform[platform] ?? 0;
    if (spend <= 0) continue; // pas de dépense → rien à diviser
    platforms.push({
      platform,
      code: labels[platform],
      spend,
      counts: countsByPlatform[platform],
      metrics: compute(spend, countsByPlatform[platform]),
    });
  }

  const extra: ExtraAcq | null = hasAny(extraCounts)
    ? { label: 'RDV Calendly + manuels', counts: extraCounts, metrics: compute(0, extraCounts) }
    : null;

  // Attribué = tous les codes pub (même si la régie n'a pas dépensé sur la période) + extra.
  const attributed = [countsByPlatform.Meta, countsByPlatform.Google, extraCounts].reduce(
    sumCounts,
    ZERO,
  );

  let total: BlendedAcquisition['total'] = null;
  if (platforms.length > 0) {
    const totalSpend = platforms.reduce((acc, p) => acc + p.spend, 0);
    const totalCounts = [
      ...platforms.map((p) => p.counts),
      ...(extra ? [extra.counts] : []),
    ].reduce(sumCounts, ZERO);
    total = { spend: totalSpend, counts: totalCounts, metrics: compute(totalSpend, totalCounts) };
  }

  return { available: platforms.length > 0 || extra !== null, platforms, extra, total, attributed };
}
