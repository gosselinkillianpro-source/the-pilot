import 'server-only';
import {
  type AccountTotals,
  type AdsPeriod,
  type DailyPoint,
  type DateRange,
  googleBetweenClause,
  googleDateClause,
} from '@/lib/ads/period';

/**
 * Client Google Ads API (v17, REST) — LECTURE SEULE des campagnes pub SAH.
 *
 * Auth : OAuth 2.0. On échange un refresh_token (permanent) contre un
 * access_token (court) à chaque appel, puis on interroge l'API REST.
 * Headers requis : developer-token + login-customer-id.
 *
 * Aucune donnée investisseur : uniquement des agrégats de campagnes. Pas de PII.
 * Pas de dépendance externe : fetch natif.
 */

const ADS_VERSION = 'v17';
const ADS_BASE = `https://googleads.googleapis.com/${ADS_VERSION}`;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleAdsConfigStatus =
  | { configured: true; customerId: string }
  | { configured: false; reason: string };

export function getGoogleAdsConfig(): GoogleAdsConfigStatus {
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customer = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!dev) return { configured: false, reason: 'GOOGLE_ADS_DEVELOPER_TOKEN manquant' };
  if (!clientId) return { configured: false, reason: 'GOOGLE_ADS_CLIENT_ID manquant' };
  if (!clientSecret) return { configured: false, reason: 'GOOGLE_ADS_CLIENT_SECRET manquant' };
  if (!refresh) return { configured: false, reason: 'GOOGLE_ADS_REFRESH_TOKEN manquant' };
  if (!customer) return { configured: false, reason: 'GOOGLE_ADS_CUSTOMER_ID manquant' };
  return { configured: true, customerId: customer.replace(/-/g, '') };
}

export type GoogleAdsCampaign = {
  platform: 'Google';
  id: string;
  name: string;
  status: 'active' | 'paused';
  spend: number; // euros
  impressions: number;
  reach: number | null; // non fourni par Google Ads -> null
  clicks: number;
  results: number; // conversions
  currency: string;
};

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID as string,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET as string,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN as string,
    grant_type: 'refresh_token',
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Google OAuth : ${json.error_description ?? `HTTP ${res.status}`}`);
  }
  return json.access_token;
}

type GaqlRow = {
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
  };
  customer?: { currencyCode?: string };
  segments?: { date?: string };
};

/** Exécute une requête GAQL (searchStream) et renvoie les lignes aplaties. */
async function gaqlSearch(query: string): Promise<GaqlRow[]> {
  const cfg = getGoogleAdsConfig();
  if (!cfg.configured) throw new Error(`Google Ads non configuré : ${cfg.reason}`);
  const accessToken = await getAccessToken();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? cfg.customerId).replace(
    /-/g,
    '',
  );
  const res = await fetch(`${ADS_BASE}/customers/${cfg.customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN as string,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = JSON.parse(text) as
        | { error?: { message?: string } }[]
        | { error?: { message?: string } };
      const first = Array.isArray(err) ? err[0] : err;
      msg = first?.error?.message ?? msg;
    } catch {
      // texte non-JSON : on garde le HTTP status
    }
    throw new Error(`Google Ads API : ${msg}`);
  }
  const chunks = JSON.parse(text) as { results?: GaqlRow[] }[];
  return chunks.flatMap((c) => c.results ?? []);
}

/**
 * Récupère les campagnes Google Ads avec métriques sur une période.
 */
export async function fetchGoogleAdsCampaigns(period: AdsPeriod): Promise<GoogleAdsCampaign[]> {
  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, customer.currency_code
    FROM campaign
    WHERE ${googleDateClause(period)}
  `;
  const rows = await gaqlSearch(query);
  return rows.map((row): GoogleAdsCampaign => {
    const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    const status: 'active' | 'paused' = row.campaign?.status === 'ENABLED' ? 'active' : 'paused';
    return {
      platform: 'Google',
      id: String(row.campaign?.id ?? ''),
      name: row.campaign?.name ?? '(sans nom)',
      status,
      spend,
      impressions: Number(row.metrics?.impressions ?? 0),
      reach: null,
      clicks: Number(row.metrics?.clicks ?? 0),
      results: Number(row.metrics?.conversions ?? 0),
      currency: row.customer?.currencyCode ?? 'EUR',
    };
  });
}

/** Totaux compte Google Ads sur une plage (pour comparaison de période). */
export async function fetchGoogleAccountTotals(range: DateRange): Promise<AccountTotals> {
  const query = `
    SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM customer
    WHERE ${googleBetweenClause(range)}
  `;
  const rows = await gaqlSearch(query);
  return rows.reduce<AccountTotals>(
    (acc, row) => ({
      spend: acc.spend + Number(row.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: acc.impressions + Number(row.metrics?.impressions ?? 0),
      reach: null,
      clicks: acc.clicks + Number(row.metrics?.clicks ?? 0),
      results: acc.results + Number(row.metrics?.conversions ?? 0),
    }),
    { spend: 0, impressions: 0, reach: null, clicks: 0, results: 0 },
  );
}

/** Série journalière Google Ads (dépense, clics, résultats) sur une plage. */
export async function fetchGoogleDailySeries(range: DateRange): Promise<DailyPoint[]> {
  const query = `
    SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM customer
    WHERE ${googleBetweenClause(range)}
    ORDER BY segments.date
  `;
  const rows = await gaqlSearch(query);
  return rows
    .filter((r) => r.segments?.date)
    .map((r) => ({
      date: r.segments?.date as string,
      spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      clicks: Number(r.metrics?.clicks ?? 0),
      results: Number(r.metrics?.conversions ?? 0),
    }));
}
