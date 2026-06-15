import 'server-only';

import {
  type AcquisitionCounts,
  AD_CODE_LABELS,
  type AdPlatform,
  getAttributedCounts,
} from '@/lib/db/queries/ads-acquisition';
import { type AdsPeriod, periodToRange } from './period';

/**
 * Coût d'acquisition « réel », croisé Meta/Google + SAH, attribué par CODE BONUS.
 *
 * On ne garde QUE la dépense pub de chaque régie (leur seul chiffre fiable) et on la
 * divise par les VRAIS inscrits SAH portant le code de cette régie — pas par les
 * conversions gonflées du pixel. C'est ce qui corrige « Meta dit 600, il y en a 180 ».
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

function sumCounts(a: AcquisitionCounts, b: AcquisitionCounts): AcquisitionCounts {
  return {
    inscrits: a.inscrits + b.inscrits,
    complets: a.complets + b.complets,
    investisseurs: a.investisseurs + b.investisseurs,
    collecte: a.collecte + b.collecte,
  };
}

export type PlatformAcq = {
  platform: AdPlatform;
  code: string;
  spend: number;
  counts: AcquisitionCounts;
  metrics: BlendedMetrics;
};

export type BlendedAcquisition = {
  available: boolean;
  platforms: PlatformAcq[]; // uniquement celles avec une dépense > 0
  total: { spend: number; counts: AcquisitionCounts; metrics: BlendedMetrics } | null;
};

/**
 * @param spendByPlatform dépense pub de la période par régie (depuis overview.byPlatform).
 */
export async function getBlendedAcquisition(
  period: AdsPeriod,
  spendByPlatform: Partial<Record<AdPlatform, number>>,
): Promise<BlendedAcquisition> {
  const counts = await getAttributedCounts(periodToRange(period));

  const platforms: PlatformAcq[] = [];
  for (const platform of ['Meta', 'Google'] as const) {
    const spend = spendByPlatform[platform] ?? 0;
    if (spend <= 0) continue; // pas de dépense → rien à attribuer
    platforms.push({
      platform,
      code: AD_CODE_LABELS[platform],
      spend,
      counts: counts[platform],
      metrics: compute(spend, counts[platform]),
    });
  }

  if (platforms.length === 0) return { available: false, platforms: [], total: null };

  const totalSpend = platforms.reduce((acc, p) => acc + p.spend, 0);
  const totalCounts = platforms.reduce((acc, p) => sumCounts(acc, p.counts), {
    inscrits: 0,
    complets: 0,
    investisseurs: 0,
    collecte: 0,
  } as AcquisitionCounts);

  return {
    available: true,
    platforms,
    total: { spend: totalSpend, counts: totalCounts, metrics: compute(totalSpend, totalCounts) },
  };
}
