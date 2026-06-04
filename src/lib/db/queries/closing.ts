import 'server-only';
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { closerTasks, interactions, investors, users } from '@/lib/db/schema';

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
