import 'server-only';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors } from '@/lib/db/schema';
import {
  CalendlyError,
  type CalendlyInvitee,
  type CalendlyUser,
  getCurrentUser,
  getEventInvitees,
  isCalendlyConfigured,
} from './client';

/**
 * Couche « vraie page RDV » : agrège les RDV Calendly réels de Guillaume
 * (passés + à venir) et les relie aux fiches investisseurs existantes (par email)
 * pour reconstituer source d'acquisition, étape pipeline et montant investi.
 *
 * Read-only de bout en bout. Tout est lu à la volée (pas de persistance) : la
 * page reste un miroir. Best-effort : un RDV illisible ne casse jamais la page.
 */

export type RdvStatut = 'a_venir' | 'honore' | 'no_show' | 'reporte' | 'annule';

export interface RdvReel {
  id: string;
  lead: string;
  email: string | null;
  investorId: string | null;
  source: string;
  date: Date;
  statut: RdvStatut;
  etape: string;
  montantInvestiEur: number | null;
  converti: boolean;
}

export interface RdvBoard {
  user: { name: string; email: string };
  rdvs: RdvReel[];
}

export type RdvBoardResult =
  | { state: 'not_configured' }
  | { state: 'error'; message: string }
  | { state: 'ok'; board: RdvBoard };

/* ----------------------------- Calendly (bas niveau) ----------------------------- */

const CALENDLY_API = 'https://api.calendly.com';

interface RawEvent {
  uri: string;
  name: string;
  status: string; // 'active' | 'canceled'
  startTime: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Liste de RDV sur une fenêtre temporelle (tous statuts confondus). */
async function listEvents(
  userUri: string,
  opts: { minStart?: string; maxStart?: string; count: number; sort: string },
): Promise<RawEvent[]> {
  const token = process.env.CALENDLY_TOKEN;
  if (!token) throw new CalendlyError('CALENDLY_TOKEN non configuré');
  const params = new URLSearchParams({
    user: userUri,
    count: String(opts.count),
    sort: opts.sort,
  });
  if (opts.minStart) params.set('min_start_time', opts.minStart);
  if (opts.maxStart) params.set('max_start_time', opts.maxStart);

  const res = await fetch(`${CALENDLY_API}/scheduled_events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new CalendlyError(`Calendly a répondu ${res.status} ${res.statusText}`, res.status);
  }
  const data: unknown = await res.json();
  const collection = isRecord(data) && Array.isArray(data.collection) ? data.collection : [];
  return collection.filter(isRecord).map((e) => ({
    uri: str(e.uri),
    name: str(e.name),
    status: str(e.status),
    startTime: str(e.start_time),
  }));
}

/** Détermine le statut métier d'un RDV à partir de l'event + son invité principal. */
function deriveStatut(ev: RawEvent, invitee: CalendlyInvitee | null, now: number): RdvStatut {
  const start = new Date(ev.startTime).getTime();
  if (ev.status === 'canceled') {
    return invitee?.rescheduled ? 'reporte' : 'annule';
  }
  if (start > now) return 'a_venir';
  // RDV passé et toujours actif : honoré, sauf si marqué no-show.
  return invitee?.noShow ? 'no_show' : 'honore';
}

/* ----------------------------- Mapping investisseur ----------------------------- */

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  linkedin_ads: 'LinkedIn Ads',
  seo: 'SEO',
  social_organic: 'Social organique',
  referral: 'Parrainage',
  other: 'Autre',
};

const STAGE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition envoyée',
  closed_won: 'Souscrit',
  closed_lost: 'Perdu',
  dormant: 'Dormant',
};

interface InvestorMatch {
  id: string;
  source: string;
  etape: string;
  montantInvestiEur: number | null;
  converti: boolean;
}

/** Récupère en une requête les investisseurs correspondant aux emails (insensible à la casse). */
async function matchInvestors(emails: string[]): Promise<Map<string, InvestorMatch>> {
  const wanted = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  const map = new Map<string, InvestorMatch>();
  if (wanted.length === 0) return map;

  const rows = await db
    .select({
      id: investors.id,
      email: investors.email,
      acquisitionSource: investors.acquisitionSource,
      pipelineStage: investors.pipelineStage,
      totalInvested: investors.totalInvested,
    })
    .from(investors)
    .where(
      and(isNull(investors.deletedAt), inArray(sql<string>`lower(${investors.email})`, wanted)),
    );

  for (const r of rows) {
    const invested = r.totalInvested ? Number(r.totalInvested) : null;
    map.set(r.email.toLowerCase(), {
      id: r.id,
      source: r.acquisitionSource ? (SOURCE_LABELS[r.acquisitionSource] ?? 'Autre') : 'Inconnue',
      etape: r.pipelineStage ? (STAGE_LABELS[r.pipelineStage] ?? r.pipelineStage) : '—',
      montantInvestiEur: invested && invested > 0 ? invested : null,
      converti: r.pipelineStage === 'closed_won',
    });
  }
  return map;
}

/* ----------------------------- Agrégation ----------------------------- */

const UPCOMING_CAP = 15;
const PAST_CAP = 25;
const PAST_WINDOW_DAYS = 45;

export async function getRdvBoard(): Promise<RdvBoardResult> {
  if (!isCalendlyConfigured()) return { state: 'not_configured' };

  let user: CalendlyUser;
  try {
    user = await getCurrentUser();
  } catch (e) {
    return { state: 'error', message: errMsg(e) };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const pastFromIso = new Date(now - PAST_WINDOW_DAYS * 86_400_000).toISOString();

  let upcoming: RawEvent[] = [];
  let past: RawEvent[] = [];
  try {
    [upcoming, past] = await Promise.all([
      listEvents(user.uri, { minStart: nowIso, count: UPCOMING_CAP, sort: 'start_time:asc' }),
      listEvents(user.uri, {
        minStart: pastFromIso,
        maxStart: nowIso,
        count: PAST_CAP,
        sort: 'start_time:desc',
      }),
    ]);
  } catch (e) {
    return { state: 'error', message: errMsg(e) };
  }

  const events = [...upcoming, ...past];

  // Invités en parallèle (1 appel par RDV — capé par UPCOMING_CAP + PAST_CAP).
  const invitees = await Promise.all(
    events.map(async (ev) => {
      try {
        const list = await getEventInvitees(ev.uri);
        return list[0] ?? null;
      } catch {
        return null;
      }
    }),
  );

  const emails = invitees.map((i) => i?.email ?? '').filter(Boolean);
  const matches = await matchInvestors(emails);

  const rdvs: RdvReel[] = events.map((ev, idx) => {
    const inv = invitees[idx] ?? null;
    const email = inv?.email ?? null;
    const m = email ? matches.get(email.toLowerCase()) : undefined;
    return {
      id: ev.uri,
      lead: inv?.name || email || 'Invité inconnu',
      email,
      investorId: m?.id ?? null,
      source: m?.source ?? (email ? 'Hors base' : '—'),
      date: new Date(ev.startTime),
      statut: deriveStatut(ev, inv, now),
      etape: m?.etape ?? '—',
      montantInvestiEur: m?.montantInvestiEur ?? null,
      converti: m?.converti ?? false,
    };
  });

  return { state: 'ok', board: { user: { name: user.name, email: user.email }, rdvs } };
}

function errMsg(e: unknown): string {
  if (e instanceof CalendlyError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
