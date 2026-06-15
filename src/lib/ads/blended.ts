import 'server-only';

import { type AcquisitionCounts, getAcquisitionCounts } from '@/lib/db/queries/ads-acquisition';
import { type AdsPeriod, periodToRange, previousRange } from './period';

/**
 * Coût d'acquisition « réel », croisé Meta/Google + SAH.
 *
 * On ne garde QUE la dépense pub des régies (leur seul chiffre fiable) et on la
 * divise par les VRAIS comptages SAH de la même fenêtre — pas par les conversions
 * gonflées du pixel Meta. C'est ce qui corrige le « Meta dit 600, il y en a 180 ».
 */
export type BlendedMetrics = {
  cpa: number | null; // dépense / inscrit
  cpi: number | null; // dépense / inscrit complet (profil + KYC)
  costPerInvestor: number | null; // dépense / investisseur
  avgTicket: number | null; // investissement moyen
  profitRatio: number | null; // investissement moyen / coût par investisseur (>1 = rentable)
};

function compute(spend: number, c: AcquisitionCounts): BlendedMetrics {
  const cpa = c.inscrits > 0 ? spend / c.inscrits : null;
  const cpi = c.complets > 0 ? spend / c.complets : null;
  const costPerInvestor = c.investisseurs > 0 ? spend / c.investisseurs : null;
  const avgTicket = c.investisseurs > 0 ? c.collecte / c.investisseurs : null;
  const profitRatio =
    avgTicket !== null && costPerInvestor !== null && costPerInvestor > 0
      ? avgTicket / costPerInvestor
      : null;
  return { cpa, cpi, costPerInvestor, avgTicket, profitRatio };
}

function pctDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

export type BlendedAcquisition = {
  available: boolean;
  spend: number;
  counts: AcquisitionCounts;
  metrics: BlendedMetrics;
  deltaPct: { cpa: number | null; cpi: number | null; costPerInvestor: number | null };
};

/**
 * @param spendCurrent  dépense pub de la période (Meta + Google) — cohérente avec le KPI « Dépense ».
 * @param spendPrevious dépense pub de la période précédente (pour le delta).
 */
export async function getBlendedAcquisition(
  period: AdsPeriod,
  spendCurrent: number,
  spendPrevious: number,
): Promise<BlendedAcquisition> {
  const cur = periodToRange(period);
  const prev = previousRange(cur);
  const { current, previous } = await getAcquisitionCounts(cur, prev);

  const metrics = compute(spendCurrent, current);
  const metricsPrev = compute(spendPrevious, previous);

  return {
    available: spendCurrent > 0 || current.inscrits > 0,
    spend: spendCurrent,
    counts: current,
    metrics,
    deltaPct: {
      cpa: pctDelta(metrics.cpa, metricsPrev.cpa),
      cpi: pctDelta(metrics.cpi, metricsPrev.cpi),
      costPerInvestor: pctDelta(metrics.costPerInvestor, metricsPrev.costPerInvestor),
    },
  };
}
