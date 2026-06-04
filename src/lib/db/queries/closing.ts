import 'server-only';
import { and, count, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { closerTasks, interactions, investors, users } from '@/lib/db/schema';

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
