import 'server-only';

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
  clicks: number;
  ctr: number; // %
  results: number; // conversions
  cpa: number | null;
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
    ctr?: number;
    conversions?: number;
  };
  customer?: { currencyCode?: string };
};

/**
 * Récupère les campagnes Google Ads avec métriques sur une période.
 * @param duringClause segment GAQL, ex. 'THIS_MONTH', 'LAST_30_DAYS', 'LAST_7_DAYS'
 */
export async function fetchGoogleAdsCampaigns(
  duringClause = 'THIS_MONTH',
): Promise<GoogleAdsCampaign[]> {
  const cfg = getGoogleAdsConfig();
  if (!cfg.configured) {
    throw new Error(`Google Ads non configuré : ${cfg.reason}`);
  }
  const accessToken = await getAccessToken();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? cfg.customerId).replace(
    /-/g,
    '',
  );

  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.conversions, customer.currency_code
    FROM campaign
    WHERE segments.date DURING ${duringClause}
  `;

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

  // searchStream renvoie un tableau de chunks { results: [...] }
  const chunks = JSON.parse(text) as { results?: GaqlRow[] }[];
  const out: GoogleAdsCampaign[] = [];
  for (const chunk of chunks) {
    for (const row of chunk.results ?? []) {
      const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const impressions = Number(row.metrics?.impressions ?? 0);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const ctr = Number(row.metrics?.ctr ?? 0) * 100; // GAQL ctr est un ratio 0..1
      const results = Number(row.metrics?.conversions ?? 0);
      const status: 'active' | 'paused' = row.campaign?.status === 'ENABLED' ? 'active' : 'paused';
      out.push({
        platform: 'Google',
        id: String(row.campaign?.id ?? ''),
        name: row.campaign?.name ?? '(sans nom)',
        status,
        spend,
        impressions,
        clicks,
        ctr,
        results,
        cpa: results > 0 ? spend / results : null,
        currency: row.customer?.currencyCode ?? 'EUR',
      });
    }
  }
  return out;
}
