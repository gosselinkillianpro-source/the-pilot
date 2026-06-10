import 'server-only';

import {
  fetchGoogleAccountTotals,
  fetchGoogleDailySeries,
  getGoogleAdsConfig,
} from '@/lib/integrations/google-ads/client';
import {
  fetchMetaAccountTotals,
  fetchMetaDailySeries,
  getMetaConfig,
} from '@/lib/integrations/meta-ads/client';
import { delta } from '@/lib/period';
import {
  type AccountTotals,
  type AdsPeriod,
  type DailyPoint,
  periodToRange,
  previousRange,
} from './period';

const ZERO: AccountTotals = { spend: 0, impressions: 0, reach: null, clicks: 0, results: 0 };

function addTotals(a: AccountTotals, b: AccountTotals): AccountTotals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    reach: null,
    clicks: a.clicks + b.clicks,
    results: a.results + b.results,
  };
}

function cpaOf(t: AccountTotals): number | null {
  return t.results > 0 ? t.spend / t.results : null;
}

function mergeSeries(series: DailyPoint[][]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const list of series) {
    for (const p of list) {
      const cur = map.get(p.date) ?? { date: p.date, spend: 0, clicks: 0, results: 0 };
      cur.spend += p.spend;
      cur.clicks += p.clicks;
      cur.results += p.results;
      map.set(p.date, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type AdsTrends = {
  available: boolean;
  series: DailyPoint[];
  current: AccountTotals & { cpa: number | null };
  previous: AccountTotals & { cpa: number | null };
  deltaPct: {
    spend: number | null;
    clicks: number | null;
    results: number | null;
    cpa: number | null;
  };
};

/**
 * Charge la série journalière + les totaux période courante & précédente.
 * Tolérant aux pannes : une plateforme qui échoue contribue 0 (jamais d'exception).
 */
export async function getAdsTrends(period: AdsPeriod): Promise<AdsTrends> {
  const curRange = periodToRange(period);
  const prevRange = previousRange(curRange);
  const metaOk = getMetaConfig().configured;
  const googleOk = getGoogleAdsConfig().configured;

  if (!metaOk && !googleOk) {
    return {
      available: false,
      series: [],
      current: { ...ZERO, cpa: null },
      previous: { ...ZERO, cpa: null },
      deltaPct: { spend: null, clicks: null, results: null, cpa: null },
    };
  }

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const [metaCur, metaPrev, metaSeries, gCur, gPrev, gSeries] = await Promise.all([
    metaOk ? safe(fetchMetaAccountTotals(curRange), ZERO) : Promise.resolve(ZERO),
    metaOk ? safe(fetchMetaAccountTotals(prevRange), ZERO) : Promise.resolve(ZERO),
    metaOk ? safe(fetchMetaDailySeries(curRange), [] as DailyPoint[]) : Promise.resolve([]),
    googleOk ? safe(fetchGoogleAccountTotals(curRange), ZERO) : Promise.resolve(ZERO),
    googleOk ? safe(fetchGoogleAccountTotals(prevRange), ZERO) : Promise.resolve(ZERO),
    googleOk ? safe(fetchGoogleDailySeries(curRange), [] as DailyPoint[]) : Promise.resolve([]),
  ]);

  const current = addTotals(metaCur, gCur);
  const previous = addTotals(metaPrev, gPrev);
  const series = mergeSeries([metaSeries, gSeries]);
  const curCpa = cpaOf(current);
  const prevCpa = cpaOf(previous);

  return {
    available: series.length > 0 || current.spend > 0 || previous.spend > 0,
    series,
    current: { ...current, cpa: curCpa },
    previous: { ...previous, cpa: prevCpa },
    deltaPct: {
      spend: delta(current.spend, previous.spend).deltaPct,
      clicks: delta(current.clicks, previous.clicks).deltaPct,
      results: delta(current.results, previous.results).deltaPct,
      cpa: curCpa !== null && prevCpa !== null ? delta(curCpa, prevCpa).deltaPct : null,
    },
  };
}
