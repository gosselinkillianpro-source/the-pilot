/**
 * Client Brevo — appels API v3 côté serveur uniquement.
 * La clé BREVO_API_KEY est un secret serveur (jamais exposée au navigateur).
 * Ne jamais importer ce fichier dans un Client Component.
 */

const BASE = 'https://api.brevo.com/v3';

function brevoHeaders(): HeadersInit {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY manquante (voir .env.local)');
  return { 'api-key': key, accept: 'application/json' };
}

async function brevoGet<T>(path: string, revalidateSeconds = 300): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: brevoHeaders(),
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`Brevo ${res.status} sur ${path}`);
  }
  return res.json() as Promise<T>;
}

/* ---------- Types (champs réellement utilisés) ---------- */
export type BrevoAccount = {
  email: string;
  companyName: string;
  plan?: { type: string; credits?: number }[];
};

export type BrevoList = {
  id: number;
  name: string;
  uniqueSubscribers: number;
  totalBlacklisted: number;
  folderId?: number;
};

type CampaignStatEntry = {
  sent?: number;
  delivered?: number;
  uniqueViews?: number;
  uniqueClicks?: number;
  clickers?: number;
  unsubscriptions?: number;
  hardBounces?: number;
  softBounces?: number;
};

type RawCampaign = {
  id: number;
  name: string;
  status: string;
  sentDate?: string;
  statistics?: { campaignStats?: CampaignStatEntry[]; globalStats?: CampaignStatEntry };
};

export type BrevoCampaign = {
  id: number;
  name: string;
  status: string;
  sentDate: string | null;
  sent: number;
  delivered: number;
  uniqueViews: number;
  uniqueClicks: number;
  openRate: number; // %
  clickRate: number; // %
};

export type BrevoTransactional = {
  requests: number;
  delivered: number;
  opens: number;
  clicks: number;
};

/* ---------- Fonctions ---------- */
export async function getBrevoAccount(): Promise<BrevoAccount> {
  return brevoGet<BrevoAccount>('/account');
}

export async function getBrevoContactsCount(): Promise<number> {
  const data = await brevoGet<{ count?: number }>('/contacts?limit=1');
  return data.count ?? 0;
}

export async function getBrevoLists(): Promise<BrevoList[]> {
  const data = await brevoGet<{ lists?: BrevoList[] }>('/contacts/lists?limit=50');
  return (data.lists ?? []).sort((a, b) => b.uniqueSubscribers - a.uniqueSubscribers);
}

export async function getBrevoCampaigns(limit = 30): Promise<BrevoCampaign[]> {
  const data = await brevoGet<{ campaigns?: RawCampaign[] }>(
    `/emailCampaigns?limit=${limit}&status=sent&sort=desc`,
  );
  return (data.campaigns ?? []).map((c) => {
    const entries = c.statistics?.campaignStats ?? [];
    type Agg = { sent: number; delivered: number; uniqueViews: number; uniqueClicks: number };
    const agg = entries.reduce<Agg>(
      (acc, s) => ({
        sent: acc.sent + (s.sent ?? 0),
        delivered: acc.delivered + (s.delivered ?? 0),
        uniqueViews: acc.uniqueViews + (s.uniqueViews ?? 0),
        uniqueClicks: acc.uniqueClicks + (s.uniqueClicks ?? 0),
      }),
      { sent: 0, delivered: 0, uniqueViews: 0, uniqueClicks: 0 },
    );
    const base = agg.delivered || agg.sent || 0;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      sentDate: c.sentDate ?? null,
      sent: agg.sent,
      delivered: agg.delivered,
      uniqueViews: agg.uniqueViews,
      uniqueClicks: agg.uniqueClicks,
      openRate: base > 0 ? Math.round((agg.uniqueViews / base) * 1000) / 10 : 0,
      clickRate: base > 0 ? Math.round((agg.uniqueClicks / base) * 1000) / 10 : 0,
    };
  });
}

export async function getBrevoTransactional(): Promise<BrevoTransactional> {
  const data = await brevoGet<BrevoTransactional>('/smtp/statistics/aggregatedReport');
  return {
    requests: data.requests ?? 0,
    delivered: data.delivered ?? 0,
    opens: data.opens ?? 0,
    clicks: data.clicks ?? 0,
  };
}
