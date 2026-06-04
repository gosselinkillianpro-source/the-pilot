import 'server-only';
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { attributeAction, type Contact, type ContactKind } from '@/lib/closing/attribution';
import { db } from '@/lib/db';
import { closerTasks, interactions, investors, subscriptions, users } from '@/lib/db/schema';

export const PIPELINE_STAGES = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'meeting_booked', label: 'RDV pris' },
  { value: 'meeting_done', label: 'RDV fait' },
  { value: 'proposal_sent', label: 'Proposition' },
  { value: 'closed_won', label: 'Gagné' },
  { value: 'closed_lost', label: 'Perdu' },
  { value: 'dormant', label: 'En sommeil' },
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TimelineItem = {
  id: string;
  type: string;
  outcome: string | null;
  note: string | null;
  byName: string | null;
  createdAt: Date;
};

/** Historique des interactions d'un investisseur (le plus récent d'abord). */
export async function getInvestorTimeline(investorId: string, limit = 50): Promise<TimelineItem[]> {
  if (!UUID_RE.test(investorId)) return [];
  const rows = await db
    .select({
      id: interactions.id,
      type: interactions.type,
      outcome: interactions.outcome,
      note: interactions.note,
      byName: users.fullName,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .leftJoin(users, eq(interactions.userId, users.id))
    .where(eq(interactions.investorId, investorId))
    .orderBy(desc(interactions.createdAt))
    .limit(limit);
  return rows;
}

export type CloserTaskItem = {
  id: string;
  investorId: string;
  investorName: string | null;
  investorPhone: string | null;
  dueAt: Date;
  note: string | null;
  overdue: boolean;
};

/**
 * Rappels/tâches en attente, échéance aujourd'hui ou dépassée (la to-do du closer).
 * Si closerId fourni, on filtre sur ses tâches.
 */
export async function getDueTasks(opts?: { closerId?: string }): Promise<CloserTaskItem[]> {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const filters = [eq(closerTasks.status, 'pending'), lte(closerTasks.dueAt, endOfToday)];
  if (opts?.closerId) filters.push(eq(closerTasks.closerId, opts.closerId));

  const rows = await db
    .select({
      id: closerTasks.id,
      investorId: closerTasks.investorId,
      investorName: investors.fullName,
      investorPhone: investors.phone,
      dueAt: closerTasks.dueAt,
      note: closerTasks.note,
    })
    .from(closerTasks)
    .innerJoin(investors, eq(closerTasks.investorId, investors.id))
    .where(and(...filters))
    .orderBy(closerTasks.dueAt);

  return rows.map((r) => ({ ...r, overdue: new Date(r.dueAt).getTime() < now.getTime() }));
}

export type BoardCard = {
  id: string;
  fullName: string | null;
  city: string | null;
  assignedCloserId: string | null;
};
export type BoardColumn = { stage: string; label: string; total: number; cards: BoardCard[] };

const BOARD_CARD_CAP = 25;

/** Tableau Kanban : investisseurs regroupés par étape de pipeline (cartes plafonnées). */
export async function getPipelineBoard(): Promise<BoardColumn[]> {
  const rows = await db
    .select({
      id: investors.id,
      fullName: investors.fullName,
      city: investors.addressCity,
      stage: investors.pipelineStage,
      assignedCloserId: investors.assignedCloserId,
      updatedAt: investors.updatedAt,
    })
    .from(investors)
    .where(isNull(investors.deletedAt))
    .orderBy(desc(investors.updatedAt));

  return PIPELINE_STAGES.map((s) => {
    const all = rows.filter((r) => r.stage === s.value);
    return {
      stage: s.value,
      label: s.label,
      total: all.length,
      cards: all.slice(0, BOARD_CARD_CAP).map((r) => ({
        id: r.id,
        fullName: r.fullName,
        city: r.city,
        assignedCloserId: r.assignedCloserId,
      })),
    };
  });
}

export type CloserOption = { id: string; name: string | null; role: string };

/** Liste des closers (pour l'assignation). */
export async function getClosers(): Promise<CloserOption[]> {
  const rows = await db
    .select({ id: users.id, name: users.fullName, role: users.role })
    .from(users)
    .where(inArray(users.role, ['admin', 'closer', 'closer_junior']));
  return rows;
}

export type CloserPerf = {
  closerId: string;
  name: string | null;
  role: string;
  calls: number;
  reached: number;
  assigned: number;
  attributedSubs: number;
  attributedAmount: number;
};
export type PerformanceReport = {
  closers: CloserPerf[];
  unattributed: { count: number; amount: number };
  totalSubs: number;
  totalAmount: number;
};

const EMAIL_KIND: Record<string, ContactKind> = {
  email_clicked: 'click',
  email_opened: 'open',
};

/**
 * Performance par closer + attribution des souscriptions (appel prime / last-touch / 30j).
 * Se remplit au fur et à mesure que les closers enregistrent des appels.
 */
export async function getCloserPerformance(): Promise<PerformanceReport> {
  const closers = await getClosers();

  // Activité d'appel par closer
  const callAgg = await db
    .select({
      userId: interactions.userId,
      calls: count(),
      reached: sql<number>`count(*) filter (where ${interactions.outcome} = 'reached')::int`,
    })
    .from(interactions)
    .where(inArray(interactions.type, ['call_outbound', 'call_inbound']))
    .groupBy(interactions.userId);
  const callByUser = new Map(callAgg.map((r) => [r.userId, r]));

  // Leads assignés par closer
  const assignAgg = await db
    .select({ closerId: investors.assignedCloserId, n: count() })
    .from(investors)
    .where(isNull(investors.deletedAt))
    .groupBy(investors.assignedCloserId);
  const assignByUser = new Map(assignAgg.map((r) => [r.closerId, Number(r.n)]));

  // Données d'attribution : souscriptions + contacts (appels + events email)
  const subs = await db
    .select({
      investorId: subscriptions.investorId,
      amount: subscriptions.amount,
      signedAt: subscriptions.signedAt,
    })
    .from(subscriptions)
    .where(sql`${subscriptions.status} <> 'cancelled' and ${subscriptions.signedAt} is not null`);

  const contactsRows = await db
    .select({
      investorId: interactions.investorId,
      type: interactions.type,
      userId: interactions.userId,
      at: interactions.createdAt,
    })
    .from(interactions)
    .where(
      inArray(interactions.type, [
        'call_outbound',
        'call_inbound',
        'email_clicked',
        'email_opened',
      ]),
    );

  const contactsByInvestor = new Map<string, Contact[]>();
  for (const c of contactsRows) {
    const kind: ContactKind = c.type.startsWith('call') ? 'call' : (EMAIL_KIND[c.type] ?? 'open');
    const list = contactsByInvestor.get(c.investorId) ?? [];
    list.push({ kind, at: c.at, userId: c.userId });
    contactsByInvestor.set(c.investorId, list);
  }

  const attributedByUser = new Map<string, { subs: number; amount: number }>();
  let unattrCount = 0;
  let unattrAmount = 0;
  let totalAmount = 0;

  for (const s of subs) {
    if (!s.signedAt) continue;
    const amount = Number(s.amount) || 0;
    totalAmount += amount;
    const res = attributeAction(s.signedAt, contactsByInvestor.get(s.investorId) ?? []);
    if (res.attributed && res.via === 'call' && res.userId) {
      const cur = attributedByUser.get(res.userId) ?? { subs: 0, amount: 0 };
      cur.subs += 1;
      cur.amount += amount;
      attributedByUser.set(res.userId, cur);
    } else {
      unattrCount += 1;
      unattrAmount += amount;
    }
  }

  const closerPerf: CloserPerf[] = closers.map((c) => {
    const call = callByUser.get(c.id);
    const attr = attributedByUser.get(c.id);
    return {
      closerId: c.id,
      name: c.name,
      role: c.role,
      calls: call ? Number(call.calls) : 0,
      reached: call ? Number(call.reached) : 0,
      assigned: assignByUser.get(c.id) ?? 0,
      attributedSubs: attr?.subs ?? 0,
      attributedAmount: attr?.amount ?? 0,
    };
  });

  return {
    closers: closerPerf,
    unattributed: { count: unattrCount, amount: unattrAmount },
    totalSubs: subs.length,
    totalAmount,
  };
}

/** Compte des appels passés aujourd'hui (pour le suivi d'activité du closer). */
export async function getTodayCallCount(opts?: { closerId?: string }): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const r = await db
    .select({ n: count() })
    .from(interactions)
    .where(
      and(
        inArray(interactions.type, ['call_outbound', 'call_inbound']),
        gte(interactions.createdAt, startOfDay),
        opts?.closerId ? eq(interactions.userId, opts.closerId) : undefined,
      ),
    );
  return r[0]?.n ?? 0;
}
