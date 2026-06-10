import 'server-only';

import { type AdCampaign, derive, rawOf } from './overview';

/** Alerte actionnable détectée sur la période. */
export type AdAlert = {
  level: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
};

// Seuils (heuristiques par défaut, ajustables).
const WASTE_SPEND_FLOOR = 30; // €, dépense à partir de laquelle 0 résultat est suspect
const LOW_CTR = 0.5; // %
const LOW_CTR_MIN_IMPR = 1000;
const CPA_OUTLIER_FACTOR = 2; // coût/résultat > 2x la moyenne = anomalie

/** Construit les alertes à partir des campagnes et du coût/résultat moyen global. */
export function buildAdsAlerts(campaigns: AdCampaign[], blendedCpa: number | null): AdAlert[] {
  const alerts: AdAlert[] = [];
  for (const c of campaigns) {
    const d = derive(rawOf(c));
    const who = `${c.platform} · ${c.name}`;

    if (c.results === 0 && c.spend >= WASTE_SPEND_FLOOR) {
      alerts.push({
        level: 'danger',
        title: who,
        detail: `${Math.round(c.spend)} € dépensés, 0 résultat sur la période.`,
      });
    } else if (
      d.cpa !== null &&
      blendedCpa !== null &&
      blendedCpa > 0 &&
      d.cpa > blendedCpa * CPA_OUTLIER_FACTOR &&
      c.spend >= WASTE_SPEND_FLOOR
    ) {
      alerts.push({
        level: 'warning',
        title: who,
        detail: `Coût/résultat ${d.cpa.toFixed(0)} € — environ ${(d.cpa / blendedCpa).toFixed(1)}× la moyenne (${blendedCpa.toFixed(0)} €).`,
      });
    }

    if (c.impressions >= LOW_CTR_MIN_IMPR && d.ctr < LOW_CTR) {
      alerts.push({
        level: 'warning',
        title: who,
        detail: `CTR faible (${d.ctr.toFixed(2)} %) — la créa ou le ciblage n'accroche pas.`,
      });
    }
  }
  // danger d'abord
  return alerts.sort((a, b) => (a.level === 'danger' ? -1 : 1) - (b.level === 'danger' ? -1 : 1));
}

export type ScoredCampaign = { c: AdCampaign; cpa: number };

export type AdsRanking = {
  best: ScoredCampaign[];
  worst: ScoredCampaign[];
  wasted: AdCampaign[];
};

/** Classe les campagnes par coût/résultat et isole le budget gaspillé. */
export function rankCampaigns(campaigns: AdCampaign[]): AdsRanking {
  const withResults: ScoredCampaign[] = campaigns
    .map((c) => ({ c, cpa: derive(rawOf(c)).cpa }))
    .filter((x): x is ScoredCampaign => x.cpa !== null && x.c.spend > 0);
  const byCpaAsc = [...withResults].sort((a, b) => a.cpa - b.cpa);
  const wasted = campaigns
    .filter((c) => c.results === 0 && c.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  return {
    best: byCpaAsc.slice(0, 3),
    worst: byCpaAsc.slice(-3).reverse(),
    wasted: wasted.slice(0, 5),
  };
}
