import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import type { AuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { closerTasks, interactions, investors, subscriptions, users } from '@/lib/db/schema';
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

export interface DepotSouhaite {
  minEur: number | null;
  maxEur: number | null;
  quand: string | null; // texte libre ou date ISO ("avant le 15/07", "2026-07-15")
}

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
  // Enrichissement fiche (null si lead hors base)
  statutInscription: string | null;
  score: number | null;
  derniereAction: { label: string; at: Date } | null;
  prochainRappel: { dueAt: Date; note: string | null } | null;
  depotSouhaite: DepotSouhaite | null;
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
  statutInscription: string;
  score: number | null;
}

/** Libellé « où en est la personne dans l'inscription » à partir des 2 booléens SAH + montant. */
function statutInscriptionLabel(opts: {
  registrationComplete: boolean;
  onboardingComplete: boolean;
  invested: number | null;
}): string {
  if (opts.invested && opts.invested > 0) return 'A déjà investi';
  if (opts.onboardingComplete) return 'Onboardé (KYC ok)';
  if (opts.registrationComplete) return 'Profil complété';
  return 'Inscrit · à compléter';
}

/** Montant réellement investi par fiche = somme des souscriptions non annulées (table subscriptions). */
async function getInvestedByInvestor(ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (ids.length === 0) return m;
  const rows = await db
    .select({
      investorId: subscriptions.investorId,
      total: sql<string>`coalesce(sum(${subscriptions.amount}), 0)`,
    })
    .from(subscriptions)
    .where(and(inArray(subscriptions.investorId, ids), ne(subscriptions.status, 'cancelled')))
    .groupBy(subscriptions.investorId);
  for (const r of rows) m.set(r.investorId, Number(r.total) || 0);
  return m;
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
      registrationComplete: investors.registrationComplete,
      onboardingComplete: investors.onboardingComplete,
      score: investors.score,
    })
    .from(investors)
    .where(
      and(isNull(investors.deletedAt), inArray(sql<string>`lower(${investors.email})`, wanted)),
    );

  // Montant investi = vraies souscriptions (investors.total_invested n'est pas alimenté par le sync).
  const invested = await getInvestedByInvestor(rows.map((r) => r.id));

  for (const r of rows) {
    const inv = invested.get(r.id) ?? 0;
    map.set(r.email.toLowerCase(), {
      id: r.id,
      source: r.acquisitionSource ? (SOURCE_LABELS[r.acquisitionSource] ?? 'Autre') : 'Inconnue',
      etape: r.pipelineStage ? (STAGE_LABELS[r.pipelineStage] ?? r.pipelineStage) : '—',
      montantInvestiEur: inv > 0 ? inv : null,
      converti: inv > 0 || r.pipelineStage === 'closed_won',
      statutInscription: statutInscriptionLabel({
        registrationComplete: r.registrationComplete,
        onboardingComplete: r.onboardingComplete,
        invested: inv,
      }),
      score: r.score,
    });
  }
  return map;
}

/* ----------------------------- Activité (dernière action, rappel, dépôt souhaité) ----------------------------- */

const INTERACTION_LABELS: Record<string, string> = {
  email_sent: 'Email envoyé',
  email_opened: 'Email ouvert',
  email_clicked: 'Lien cliqué',
  page_visit: 'Visite du site',
  simulator_used: 'Simulateur utilisé',
  dic_downloaded: 'DIC téléchargé',
  call_outbound: 'Appel sortant',
  call_inbound: 'Appel entrant',
  whatsapp_sent: 'WhatsApp envoyé',
  whatsapp_received: 'WhatsApp reçu',
  linkedin_dm: 'Message LinkedIn',
  sms_sent: 'SMS envoyé',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition envoyée',
  note_added: 'Note ajoutée',
};

interface InvestorActivity {
  derniereAction: { label: string; at: Date } | null;
  prochainRappel: { dueAt: Date; note: string | null } | null;
  depotSouhaite: DepotSouhaite | null;
}

function readDepot(metadata: unknown, valueNumeric: string | null): DepotSouhaite | null {
  const meta = isRecord(metadata) ? metadata : null;
  if (!meta || meta.kind !== 'rdv_outcome') return null;
  const min =
    typeof meta.depotMin === 'number' ? meta.depotMin : valueNumeric ? Number(valueNumeric) : null;
  const max = typeof meta.depotMax === 'number' ? meta.depotMax : null;
  const quand = typeof meta.depotQuand === 'string' ? meta.depotQuand : null;
  if (min == null && max == null && !quand) return null;
  return { minEur: min, maxEur: max, quand };
}

/** Dernière action, prochain rappel et dépôt souhaité (le plus récent) pour une liste de fiches. */
async function getActivity(ids: string[]): Promise<Map<string, InvestorActivity>> {
  const map = new Map<string, InvestorActivity>();
  if (ids.length === 0) return map;

  const [ix, tasks] = await Promise.all([
    db
      .select({
        investorId: interactions.investorId,
        type: interactions.type,
        note: interactions.note,
        valueNumeric: interactions.valueNumeric,
        metadata: interactions.metadata,
        createdAt: interactions.createdAt,
      })
      .from(interactions)
      .where(inArray(interactions.investorId, ids))
      .orderBy(desc(interactions.createdAt)),
    db
      .select({
        investorId: closerTasks.investorId,
        dueAt: closerTasks.dueAt,
        note: closerTasks.note,
      })
      .from(closerTasks)
      .where(and(inArray(closerTasks.investorId, ids), eq(closerTasks.status, 'pending')))
      .orderBy(asc(closerTasks.dueAt)),
  ]);

  for (const id of ids)
    map.set(id, { derniereAction: null, prochainRappel: null, depotSouhaite: null });

  // interactions triées du + récent au + ancien → 1ère vue par investisseur = dernière action.
  for (const row of ix) {
    const entry = map.get(row.investorId);
    if (!entry) continue;
    if (!entry.derniereAction) {
      entry.derniereAction = {
        label: INTERACTION_LABELS[row.type] ?? row.type,
        at: new Date(row.createdAt),
      };
    }
    if (!entry.depotSouhaite) {
      const d = readDepot(row.metadata, row.valueNumeric);
      if (d) entry.depotSouhaite = d;
    }
  }

  // tasks triées par échéance croissante → 1ère vue = prochain rappel.
  for (const t of tasks) {
    const entry = map.get(t.investorId);
    if (entry && !entry.prochainRappel) {
      entry.prochainRappel = { dueAt: new Date(t.dueAt), note: t.note };
    }
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

  // Enrichissement activité pour les fiches reconnues.
  const matchedIds = [...new Set([...matches.values()].map((m) => m.id))];
  const activity = await getActivity(matchedIds);

  const rdvs: RdvReel[] = events.map((ev, idx) => {
    const inv = invitees[idx] ?? null;
    const email = inv?.email ?? null;
    const m = email ? matches.get(email.toLowerCase()) : undefined;
    const act = m ? activity.get(m.id) : undefined;
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
      statutInscription: m?.statutInscription ?? null,
      score: m?.score ?? null,
      derniereAction: act?.derniereAction ?? null,
      prochainRappel: act?.prochainRappel ?? null,
      depotSouhaite: act?.depotSouhaite ?? null,
    };
  });

  return { state: 'ok', board: { user: { name: user.name, email: user.email }, rdvs } };
}

function errMsg(e: unknown): string {
  if (e instanceof CalendlyError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/* ----------------------------- Assignation auto à Guillaume ----------------------------- */

export interface RdvAssignResult {
  ownerFound: boolean;
  ownerName: string | null;
  assigned: number; // nombre de fiches dont le closer a changé lors de cet appel
}

/**
 * Retrouve l'utilisateur PILOT propriétaire du Calendly (Guillaume) :
 * 1) par l'email du compte Calendly (le plus fiable), 2) à défaut par le nom.
 */
async function findOwnerUser(
  calendlyEmail: string,
  _calendlyName: string,
): Promise<{ id: string; name: string | null } | null> {
  if (calendlyEmail) {
    const byEmail = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(
        and(eq(sql`lower(${users.email})`, calendlyEmail.toLowerCase()), eq(users.active, true)),
      )
      .limit(1);
    if (byEmail[0]) return { id: byEmail[0].id, name: byEmail[0].fullName };
  }
  const byName = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(ilike(users.fullName, '%gosselin%'), eq(users.active, true)))
    .limit(1);
  if (byName[0]) return { id: byName[0].id, name: byName[0].fullName };
  return null;
}

/**
 * Assigne automatiquement à Guillaume TOUS les leads (présents en base) issus d'un
 * RDV Calendly. Force la propriété : même un lead déjà assigné à un autre closer
 * bascule vers Guillaume (décision produit — c'est lui qui tient les RDV Funnel B).
 *
 * Idempotent : ne touche que les fiches dont le closer diffère déjà de Guillaume,
 * donc en régime établi l'UPDATE ne modifie 0 ligne. Audit loggé uniquement quand
 * au moins une fiche change. Best-effort : n'interrompt jamais l'affichage.
 */
export async function autoAssignRdvLeads(
  board: RdvBoard,
  viewer: AuthenticatedUser,
): Promise<RdvAssignResult> {
  const owner = await findOwnerUser(board.user.email, board.user.name);
  if (!owner) return { ownerFound: false, ownerName: null, assigned: 0 };

  const ids = [
    ...new Set(board.rdvs.map((r) => r.investorId).filter((x): x is string => Boolean(x))),
  ];
  if (ids.length === 0) return { ownerFound: true, ownerName: owner.name, assigned: 0 };

  const changed = await db
    .update(investors)
    .set({ assignedCloserId: owner.id })
    .where(
      and(
        inArray(investors.id, ids),
        or(isNull(investors.assignedCloserId), ne(investors.assignedCloserId, owner.id)),
      ),
    )
    .returning({ id: investors.id });

  if (changed.length > 0) {
    await ensureUserRecord(viewer); // garantit la FK audit_log.user_id
    await logAudit({
      userId: viewer.id,
      userEmail: viewer.email,
      userRole: viewer.role,
      action: 'rdv.calendly_auto_assign',
      resourceType: 'investor',
      resourceId: owner.id,
      metadata: {
        ownerName: owner.name,
        count: changed.length,
        investorIds: changed.map((c) => c.id),
      },
    });
  }

  return { ownerFound: true, ownerName: owner.name, assigned: changed.length };
}
