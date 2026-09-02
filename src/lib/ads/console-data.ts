import 'server-only';

import type { FixedCostRow } from '@/lib/db/queries/ad-fixed-costs';
import { listFixedCosts, sumFixedCostsForRange } from '@/lib/db/queries/ad-fixed-costs';
import {
  type AcquisitionCounts,
  type CohortRow,
  getAdsCohortRows,
  getAttributedCounts,
  getManualVsRdvSplit,
  getRdvFunnelCounts,
  getSahTotals,
  type RdvFunnelCounts,
  type SahTotals,
} from '@/lib/db/queries/ads-acquisition';
import {
  fetchMetaAccountTotals,
  fetchMetaCampaignDailySeries,
  fetchMetaCampaigns,
  fetchMetaDailySeries,
  fetchMetaMonthlySpend,
  getMetaConfig,
  type MetaCampaign,
  type MonthlySpend,
} from '@/lib/integrations/meta-ads/client';
import {
  buildConsoleAlerts,
  type CampaignDecision,
  type ConsoleAlert,
  decideCampaign,
  medianCpl,
} from './decisions';
import { buildFunnel, type Funnel, type FunnelInput } from './funnel-math';
import {
  type AccountTotals,
  type AdsPeriod,
  type DailyPoint,
  type DateRange,
  periodToRange,
  previousRange,
} from './period';

/**
 * Console de pilotage Ads : UNE fonction qui rassemble tout ce que la page
 * affiche, en parallèle. Chaque source qui échoue devient un `null` explicite
 * (« non tracké » / « indisponible »), jamais un zéro silencieux.
 *
 * Meta uniquement — Google est en pause (décision Killian 02/09/2026).
 */

export type VitalKpi = {
  current: number | null; // null = source indisponible
  previous: number | null;
  deltaPct: number | null;
};

export type ConsoleCampaignRow = {
  id: string;
  name: string;
  status: 'active' | 'paused';
  spend: number;
  results: number; // leads pixel
  cpl: number | null; // pixel — comparaison entre campagnes uniquement
  /** Dépense des 7 derniers jours de la période, pour la sparkline. */
  spark: number[];
  decision: CampaignDecision;
  /** Diagnostic pour le drill-down (métriques « vanity » assumées comme telles). */
  diag: {
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    frequency: number | null;
  };
};

export type AttributionLevel = {
  key: 'certain' | 'probable' | 'non_attribue';
  label: string;
  detail: string;
  counts: AcquisitionCounts;
};

export type CohortView = CohortRow & {
  spend: number | null; // dépense Meta du mois (null = indisponible)
  ratio: number | null; // collecte à date ÷ dépense du mois
};

export type AdsConsoleData = {
  range: DateRange;
  prevRange: DateRange;
  meta: { configured: boolean; ok: boolean; reason: string | null };
  vital: { spend: VitalKpi; revenue: VitalKpi; roas: VitalKpi; leads: VitalKpi };
  funnel: Funnel;
  rdv: { cur: RdvFunnelCounts; prev: RdvFunnelCounts };
  campaigns: ConsoleCampaignRow[];
  attribution: { levels: AttributionLevel[]; totalSah: SahTotals };
  cohorts: CohortView[];
  costs: {
    list: FixedCostRow[];
    totalForPeriod: number;
    roasMedia: number | null; // revenu attribué ÷ dépense média
    roiComplet: number | null; // revenu attribué ÷ (dépense média + coûts fixes)
  };
  alerts: ConsoleAlert[];
};

const ZERO_COUNTS: AcquisitionCounts = { inscrits: 0, complets: 0, investisseurs: 0, collecte: 0 };

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

function sumCounts(list: AcquisitionCounts[]): AcquisitionCounts {
  return list.reduce(
    (a, b) => ({
      inscrits: a.inscrits + b.inscrits,
      complets: a.complets + b.complets,
      investisseurs: a.investisseurs + b.investisseurs,
      collecte: a.collecte + b.collecte,
    }),
    ZERO_COUNTS,
  );
}

function kpi(current: number | null, previous: number | null): VitalKpi {
  const deltaPct =
    current !== null && previous !== null && previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : null;
  return { current, previous, deltaPct };
}

function buildCampaignRows(
  campaigns: MetaCampaign[],
  seriesByCampaign: Map<string, DailyPoint[]>,
): ConsoleCampaignRow[] {
  const median = medianCpl(campaigns);
  return campaigns
    .map((c): ConsoleCampaignRow => {
      const series = seriesByCampaign.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        spend: c.spend,
        results: c.results,
        cpl: c.results > 0 ? c.spend / c.results : null,
        spark: series.slice(-7).map((p) => p.spend),
        decision: decideCampaign(
          { status: c.status, spend: c.spend, results: c.results, series },
          median,
        ),
        diag: {
          impressions: c.impressions,
          clicks: c.clicks,
          ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null,
          cpc: c.clicks > 0 ? c.spend / c.clicks : null,
          cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null,
          frequency: c.reach && c.reach > 0 ? c.impressions / c.reach : null,
        },
      };
    })
    .sort((a, b) => b.spend - a.spend); // tri par défaut : dépense décroissante
}

/** Fenêtre des cohortes : du 1er du mois il y a (monthsBack-1) mois à aujourd'hui. */
function cohortRange(monthsBack: number, now = new Date()): DateRange {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));
  return { since: start.toISOString().slice(0, 10), until: now.toISOString().slice(0, 10) };
}

const COHORT_MONTHS = 6;

export async function getAdsConsole(period: AdsPeriod): Promise<AdsConsoleData> {
  const range = periodToRange(period);
  const prevRange = previousRange(range);
  const metaCfg = getMetaConfig();

  const [
    campaigns,
    totalsCur,
    totalsPrev,
    accountDaily,
    campaignDaily,
    monthlySpend,
    attribCur,
    attribPrev,
    splitCur,
    splitPrev,
    sahCur,
    rdvCur,
    rdvPrev,
    cohortRows,
    fixedList,
    fixedTotal,
  ] = await Promise.all([
    metaCfg.configured ? safe(fetchMetaCampaigns(period)) : Promise.resolve(null),
    metaCfg.configured ? safe(fetchMetaAccountTotals(range)) : Promise.resolve(null),
    metaCfg.configured ? safe(fetchMetaAccountTotals(prevRange)) : Promise.resolve(null),
    metaCfg.configured ? safe(fetchMetaDailySeries(range)) : Promise.resolve(null),
    metaCfg.configured ? safe(fetchMetaCampaignDailySeries(range)) : Promise.resolve(null),
    metaCfg.configured
      ? safe(fetchMetaMonthlySpend(cohortRange(COHORT_MONTHS)))
      : Promise.resolve(null),
    getAttributedCounts(range),
    getAttributedCounts(prevRange),
    getManualVsRdvSplit(range),
    getManualVsRdvSplit(prevRange),
    getSahTotals(range),
    getRdvFunnelCounts(range),
    getRdvFunnelCounts(prevRange),
    getAdsCohortRows(COHORT_MONTHS),
    listFixedCosts(),
    sumFixedCostsForRange(range),
  ]);

  const metaOk = campaigns !== null;

  // Attribution : codes (tout est Meta, Google en pause) + manuel + RDV.
  const attributedCur = sumCounts([attribCur.Meta, splitCur.manual, splitCur.rdv]);
  const attributedPrev = sumCounts([attribPrev.Meta, splitPrev.manual, splitPrev.rdv]);

  const spendCur = totalsCur?.spend ?? null;
  const spendPrev = totalsPrev?.spend ?? null;
  const roasCur = spendCur !== null && spendCur > 0 ? attributedCur.collecte / spendCur : null;
  const roasPrev = spendPrev !== null && spendPrev > 0 ? attributedPrev.collecte / spendPrev : null;

  const funnelInput = (
    totals: AccountTotals | null,
    attributed: AcquisitionCounts,
    rdv: RdvFunnelCounts,
  ): FunnelInput => ({
    impressions: totals?.impressions ?? null,
    clicks: totals?.clicks ?? null,
    leads: attributed.inscrits,
    rdvPris: rdv.tracked ? rdv.pris : null,
    rdvHonores: rdv.tracked ? rdv.honores : null,
    closes: attributed.investisseurs,
    revenue: attributed.collecte,
  });

  const funnel = buildFunnel(
    funnelInput(totalsCur, attributedCur, rdvCur),
    funnelInput(totalsPrev, attributedPrev, rdvPrev),
    spendCur ?? 0,
  );

  const campaignRows = buildCampaignRows(campaigns ?? [], campaignDaily ?? new Map());

  const levels: AttributionLevel[] = [
    {
      key: 'certain',
      label: 'Attribué certain',
      detail: 'Code bonus pub saisi à l’inscription, ou rattachement manuel explicite.',
      counts: sumCounts([attribCur.Meta, splitCur.manual]),
    },
    {
      key: 'probable',
      label: 'Attribué probable',
      detail: 'Déduit d’un RDV Calendly sans autre canal revendiquant la personne.',
      counts: splitCur.rdv,
    },
    {
      key: 'non_attribue',
      label: 'NON attribué',
      detail: 'Le reste du réel SAH de la période — jamais masqué, jamais réparti.',
      counts: {
        inscrits: Math.max(0, sahCur.inscrits - attributedCur.inscrits),
        complets: 0, // non suivi à ce niveau
        investisseurs: Math.max(0, sahCur.investisseurs - attributedCur.investisseurs),
        collecte: Math.max(0, sahCur.collecte - attributedCur.collecte),
      },
    },
  ];

  const spendByMonth = new Map<string, number>(
    (monthlySpend ?? []).map((m: MonthlySpend) => [m.month, m.spend]),
  );
  const cohorts: CohortView[] = cohortRows.map((r) => {
    const spend = spendByMonth.has(r.month) ? (spendByMonth.get(r.month) as number) : null;
    return {
      ...r,
      spend,
      ratio: spend !== null && spend > 0 ? r.collecte / spend : null,
    };
  });

  const roiComplet =
    spendCur !== null && spendCur + fixedTotal > 0
      ? attributedCur.collecte / (spendCur + fixedTotal)
      : null;

  const alerts = buildConsoleAlerts({
    accountDaily: accountDaily ?? [],
    campaigns: (campaigns ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status })),
    seriesByCampaign: campaignDaily ?? new Map<string, DailyPoint[]>(),
    rdv: { cur: rdvCur, prev: rdvPrev },
  });

  return {
    range,
    prevRange,
    meta: {
      configured: metaCfg.configured,
      ok: metaOk,
      reason: metaCfg.configured ? (metaOk ? null : 'appel Meta en échec') : metaCfg.reason,
    },
    vital: {
      spend: kpi(spendCur, spendPrev),
      revenue: kpi(attributedCur.collecte, attributedPrev.collecte),
      roas: kpi(roasCur, roasPrev),
      leads: kpi(attributedCur.inscrits, attributedPrev.inscrits),
    },
    funnel,
    rdv: { cur: rdvCur, prev: rdvPrev },
    campaigns: campaignRows,
    attribution: { levels, totalSah: sahCur },
    cohorts,
    costs: {
      list: fixedList,
      totalForPeriod: fixedTotal,
      roasMedia: roasCur,
      roiComplet,
    },
    alerts,
  };
}
