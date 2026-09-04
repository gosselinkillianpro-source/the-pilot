import 'server-only';
import {
  type AccountTotals,
  type AdsPeriod,
  type DailyPoint,
  type DateRange,
  metaInsightsRange,
  metaTimeRangeValue,
} from '@/lib/ads/period';
import { cached } from '@/lib/cache/ttl';

/**
 * Durée de vie du cache des réponses Meta. Les chiffres média bougent à
 * l'échelle de l'heure : 5 minutes en mémoire rendent la console Ads
 * instantanée sans fausser une décision.
 */
const META_CACHE_MS = 5 * 60_000;

/**
 * Client Meta Marketing API (Graph API) — LECTURE SEULE des campagnes pub SAH.
 *
 * Auth : token "system user" permanent (META_SYSTEM_USER_TOKEN), généré dans
 * le Business Manager SAH. Compte pub : META_AD_ACCOUNT_ID.
 *
 * Aucune donnée investisseur ne transite ici : on ne lit que des agrégats de
 * campagnes (dépense, impressions, clics, résultats). Pas de PII.
 *
 * Pas de dépendance externe : fetch natif.
 */

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaConfigStatus =
  | { configured: true; accountId: string }
  | { configured: false; reason: string };

/** Vérifie si Meta est configuré, sans rien appeler. */
export function getMetaConfig(): MetaConfigStatus {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token) return { configured: false, reason: 'META_SYSTEM_USER_TOKEN manquant' };
  if (!accountId) return { configured: false, reason: 'META_AD_ACCOUNT_ID manquant' };
  return { configured: true, accountId };
}

export type MetaCampaign = {
  platform: 'Meta';
  id: string;
  name: string;
  status: 'active' | 'paused';
  spend: number; // en euros
  impressions: number;
  reach: number | null; // personnes uniques touchées (Meta uniquement)
  clicks: number;
  results: number; // conversions/leads (objectif de la campagne)
  currency: string;
};

type GraphInsight = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
  account_currency?: string;
};

type GraphCampaignRow = {
  id: string;
  name: string;
  effective_status?: string;
  insights?: { data?: GraphInsight[] };
};

type GraphError = { error?: { message?: string; type?: string; code?: number } };

const RESULT_ACTION_TYPES = new Set([
  'lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_complete_registration',
  'complete_registration',
]);

function extractResults(insight: GraphInsight | undefined): number {
  if (!insight?.actions) return 0;
  let total = 0;
  for (const a of insight.actions) {
    if (RESULT_ACTION_TYPES.has(a.action_type)) total += Number(a.value) || 0;
  }
  return total;
}

/**
 * Récupère les campagnes du compte avec leurs insights sur une période.
 */
export function fetchMetaCampaigns(period: AdsPeriod): Promise<MetaCampaign[]> {
  return cached(`meta:campaigns:${JSON.stringify(period)}`, META_CACHE_MS, () =>
    fetchMetaCampaignsUncached(period),
  );
}

async function fetchMetaCampaignsUncached(period: AdsPeriod): Promise<MetaCampaign[]> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    throw new Error(`Meta non configuré : ${cfg.reason}`);
  }
  const token = process.env.META_SYSTEM_USER_TOKEN as string;
  const account = cfg.accountId.startsWith('act_') ? cfg.accountId : `act_${cfg.accountId}`;

  const insightsFields = 'spend,impressions,reach,clicks,actions,account_currency';
  const params = new URLSearchParams({
    fields: `id,name,effective_status,insights.${metaInsightsRange(period)}{${insightsFields}}`,
    limit: '200',
    access_token: token,
  });

  const url = `${GRAPH_BASE}/${account}/campaigns?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: GraphCampaignRow[] } & GraphError;

  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Meta API : ${msg}`);
  }

  const rows = json.data ?? [];
  return rows.map((row): MetaCampaign => {
    const insight = row.insights?.data?.[0];
    const spend = Number(insight?.spend ?? 0);
    const impressions = Number(insight?.impressions ?? 0);
    const reach = insight?.reach !== undefined ? Number(insight.reach) : null;
    const clicks = Number(insight?.clicks ?? 0);
    const results = extractResults(insight);
    const status: 'active' | 'paused' = row.effective_status === 'ACTIVE' ? 'active' : 'paused';
    return {
      platform: 'Meta',
      id: row.id,
      name: row.name,
      status,
      spend,
      impressions,
      reach,
      clicks,
      results,
      currency: insight?.account_currency ?? 'EUR',
    };
  });
}

type GraphDailyRow = GraphInsight & { date_start?: string };

function fetchMetaInsights(range: DateRange, daily: boolean): Promise<GraphDailyRow[]> {
  return cached(
    `meta:insights:${range.since}:${range.until}:${daily ? 'daily' : 'total'}`,
    META_CACHE_MS,
    () => fetchMetaInsightsUncached(range, daily),
  );
}

async function fetchMetaInsightsUncached(
  range: DateRange,
  daily: boolean,
): Promise<GraphDailyRow[]> {
  const token = process.env.META_SYSTEM_USER_TOKEN as string;
  const cfg = getMetaConfig();
  if (!cfg.configured) throw new Error(`Meta non configuré : ${cfg.reason}`);
  const account = cfg.accountId.startsWith('act_') ? cfg.accountId : `act_${cfg.accountId}`;
  const params = new URLSearchParams({
    fields: 'spend,impressions,reach,clicks,actions',
    time_range: metaTimeRangeValue(range),
    level: 'account',
    access_token: token,
  });
  if (daily) params.set('time_increment', '1');
  const url = `${GRAPH_BASE}/${account}/insights?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: GraphDailyRow[] } & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`Meta API : ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json.data ?? [];
}

/** Totaux compte Meta agrégés sur une plage (pour comparaison de période). */
export async function fetchMetaAccountTotals(range: DateRange): Promise<AccountTotals> {
  const rows = await fetchMetaInsights(range, false);
  const r = rows[0];
  return {
    spend: Number(r?.spend ?? 0),
    impressions: Number(r?.impressions ?? 0),
    reach: r?.reach !== undefined ? Number(r.reach) : null,
    clicks: Number(r?.clicks ?? 0),
    results: extractResults(r),
  };
}

/** Série journalière Meta (dépense, clics, résultats) sur une plage. */
export async function fetchMetaDailySeries(range: DateRange): Promise<DailyPoint[]> {
  const rows = await fetchMetaInsights(range, true);
  return rows
    .filter((r) => r.date_start)
    .map((r) => ({
      date: r.date_start as string,
      spend: Number(r.spend ?? 0),
      clicks: Number(r.clicks ?? 0),
      results: extractResults(r),
    }));
}

export type CampaignDailyPoint = DailyPoint & { campaignId: string };

type GraphCampaignDailyRow = GraphDailyRow & { campaign_id?: string };

/**
 * Séries journalières PAR CAMPAGNE sur une plage, en UN appel (level=campaign,
 * time_increment=1). Alimente les sparklines de la table campagnes et les
 * règles de décision/alerte fondées sur la tendance (48 h sans lead, CPL 3 j).
 */
export function fetchMetaCampaignDailySeries(range: DateRange): Promise<Map<string, DailyPoint[]>> {
  return cached(`meta:campaign-daily:${range.since}:${range.until}`, META_CACHE_MS, () =>
    fetchMetaCampaignDailySeriesUncached(range),
  );
}

async function fetchMetaCampaignDailySeriesUncached(
  range: DateRange,
): Promise<Map<string, DailyPoint[]>> {
  const cfg = getMetaConfig();
  if (!cfg.configured) throw new Error(`Meta non configuré : ${cfg.reason}`);
  const token = process.env.META_SYSTEM_USER_TOKEN as string;
  const account = cfg.accountId.startsWith('act_') ? cfg.accountId : `act_${cfg.accountId}`;
  const params = new URLSearchParams({
    fields: 'campaign_id,spend,impressions,clicks,actions',
    time_range: metaTimeRangeValue(range),
    level: 'campaign',
    time_increment: '1',
    limit: '2000',
    access_token: token,
  });
  const url = `${GRAPH_BASE}/${account}/insights?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: GraphCampaignDailyRow[] } & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`Meta API : ${json.error?.message ?? `HTTP ${res.status}`}`);
  }

  const byCampaign = new Map<string, DailyPoint[]>();
  for (const row of json.data ?? []) {
    if (!row.campaign_id || !row.date_start) continue;
    const list = byCampaign.get(row.campaign_id) ?? [];
    list.push({
      date: row.date_start,
      spend: Number(row.spend ?? 0),
      clicks: Number(row.clicks ?? 0),
      results: extractResults(row),
    });
    byCampaign.set(row.campaign_id, list);
  }
  for (const list of byCampaign.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return byCampaign;
}

export type MonthlySpend = { month: string; spend: number }; // month = 'YYYY-MM'

/** Dépense Meta agrégée PAR MOIS sur une plage (pour la vue cohortes). */
export function fetchMetaMonthlySpend(range: DateRange): Promise<MonthlySpend[]> {
  return cached(`meta:monthly:${range.since}:${range.until}`, META_CACHE_MS, () =>
    fetchMetaMonthlySpendUncached(range),
  );
}

async function fetchMetaMonthlySpendUncached(range: DateRange): Promise<MonthlySpend[]> {
  const cfg = getMetaConfig();
  if (!cfg.configured) throw new Error(`Meta non configuré : ${cfg.reason}`);
  const token = process.env.META_SYSTEM_USER_TOKEN as string;
  const account = cfg.accountId.startsWith('act_') ? cfg.accountId : `act_${cfg.accountId}`;
  const params = new URLSearchParams({
    fields: 'spend',
    time_range: metaTimeRangeValue(range),
    level: 'account',
    time_increment: 'monthly',
    access_token: token,
  });
  const url = `${GRAPH_BASE}/${account}/insights?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json()) as { data?: GraphDailyRow[] } & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`Meta API : ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return (json.data ?? [])
    .filter((r) => r.date_start)
    .map((r) => ({ month: (r.date_start as string).slice(0, 7), spend: Number(r.spend ?? 0) }));
}
