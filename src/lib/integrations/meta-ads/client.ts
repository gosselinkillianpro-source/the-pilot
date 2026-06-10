import 'server-only';

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
  clicks: number;
  ctr: number; // %
  results: number; // conversions/leads (objectif de la campagne)
  cpa: number | null; // coût par résultat, null si 0 résultat
  currency: string;
};

type GraphInsight = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
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
 * @param datePreset ex. 'this_month', 'last_30d', 'last_7d'
 */
export async function fetchMetaCampaigns(datePreset = 'this_month'): Promise<MetaCampaign[]> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    throw new Error(`Meta non configuré : ${cfg.reason}`);
  }
  const token = process.env.META_SYSTEM_USER_TOKEN as string;
  const account = cfg.accountId.startsWith('act_') ? cfg.accountId : `act_${cfg.accountId}`;

  const insightsFields = 'spend,impressions,clicks,ctr,actions,account_currency';
  const params = new URLSearchParams({
    fields: `id,name,effective_status,insights.date_preset(${datePreset}){${insightsFields}}`,
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
    const clicks = Number(insight?.clicks ?? 0);
    const ctr = Number(insight?.ctr ?? 0);
    const results = extractResults(insight);
    const status: 'active' | 'paused' = row.effective_status === 'ACTIVE' ? 'active' : 'paused';
    return {
      platform: 'Meta',
      id: row.id,
      name: row.name,
      status,
      spend,
      impressions,
      clicks,
      ctr,
      results,
      cpa: results > 0 ? spend / results : null,
      currency: insight?.account_currency ?? 'EUR',
    };
  });
}
