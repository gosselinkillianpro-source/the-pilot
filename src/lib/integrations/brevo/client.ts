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

/* ---------- Boîte d'envoi (emails transactionnels envoyés + statut) ---------- */
export type SentEmailStatus =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'spam'
  | 'blocked';

export type SentEmail = {
  id: string;
  subject: string;
  to: string;
  date: string | null;
  tags: string[];
  status: SentEmailStatus;
};

type RawEvent = {
  messageId?: string;
  event?: string;
  email?: string;
  subject?: string;
  date?: string;
};

// Priorité d'affichage : on retient l'état le plus "avancé" connu pour un email.
const STATUS_RANK: Record<SentEmailStatus, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  bounced: 4,
  spam: 5,
  blocked: 6,
};

function mapEventToStatus(event: string): SentEmailStatus {
  switch (event) {
    case 'delivered':
      return 'delivered';
    case 'opened':
    case 'uniqueOpened':
    case 'loadedByProxy':
      return 'opened';
    case 'clicks':
    case 'click':
      return 'clicked';
    case 'hardBounces':
    case 'softBounces':
    case 'bounces':
      return 'bounced';
    case 'spam':
      return 'spam';
    case 'blocked':
    case 'invalid':
      return 'blocked';
    default:
      return 'sent'; // requests, deferred, etc.
  }
}

/**
 * Liste des derniers emails transactionnels envoyés, reconstruite à partir des
 * événements Brevo (/smtp/statistics/events) groupés par messageId.
 * Pour chaque email : destinataire, objet, date d'envoi (la plus ancienne vue)
 * et statut le plus avancé (livré → ouvert → cliqué → bounce…).
 */
export async function getSentEmails(limit = 50): Promise<SentEmail[]> {
  const ev = await brevoGet<{ events?: RawEvent[] }>('/smtp/statistics/events?limit=1000', 120);

  type Acc = {
    id: string;
    subject: string;
    to: string;
    date: string | null;
    status: SentEmailStatus;
  };
  const byId = new Map<string, Acc>();

  for (const e of ev.events ?? []) {
    if (!e.messageId) continue;
    const status = mapEventToStatus(e.event ?? '');
    const existing = byId.get(e.messageId);
    if (!existing) {
      byId.set(e.messageId, {
        id: e.messageId,
        subject: e.subject ?? '(sans objet)',
        to: e.email ?? '—',
        date: e.date ?? null,
        status,
      });
      continue;
    }
    // Statut le plus avancé.
    if (STATUS_RANK[status] > STATUS_RANK[existing.status]) existing.status = status;
    // Date d'envoi = la plus ancienne observée pour ce message.
    if (e.date && (!existing.date || e.date < existing.date)) existing.date = e.date;
  }

  return Array.from(byId.values())
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, limit)
    .map(({ id, subject, to, date, status }) => ({ id, subject, to, date, tags: [], status }));
}
