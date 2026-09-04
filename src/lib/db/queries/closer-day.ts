import 'server-only';
import { sql } from 'drizzle-orm';
import { cached } from '@/lib/cache/ttl';
import { CREDIT_ACTION_TYPES } from '@/lib/closing/credit';
import { type SplitTasks, sessionOrder, splitTasks } from '@/lib/closing/day';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/closing/gamification/leaderboard';
import { parisDateOf, parisMidnightUTC } from '@/lib/closing/gamification/periods';
import { investorOrigin, originGroup } from '@/lib/closing/origin';
import { isClosingStage } from '@/lib/closing/pipeline';
import { buildPool, type Pool } from '@/lib/closing/pool';
import {
  type Mission,
  missionForBucket,
  type RelationshipState,
  relationshipState,
} from '@/lib/closing/relationship-state';
import { db } from '@/lib/db';
import { getCallQueue, type QueueRow } from './call-queue';
import { type CallbackRow, getFollowUp, type ToQualifyRow } from './follow-up';
import { listCreditedSubscriptions } from './portfolio';

/**
 * Les données du poste de travail d'un closer : « Aujourd'hui », « Mes
 * clients », et l'ordre du mode appel. Tout vient des requêtes existantes ;
 * les règles (états, pool, découpage de la journée) vivent dans
 * `lib/closing/*` et sont testées à part.
 */

export type ClientRow = QueueRow & {
  state: RelationshipState;
  mission: Mission;
  hasSubscription: boolean;
};

export function toClientRow(row: QueueRow, now: Date): ClientRow {
  const fu = row.followUp;
  const last = row.lastActivity;
  const hasSubscription = row.totalInvested > 0;
  const state = relationshipState({
    hasSubscription,
    onboardingComplete: row.onboardingComplete,
    stage: isClosingStage(row.pipelineStage) ? row.pipelineStage : 'new',
    reachedCount: fu?.reachedCount ?? 0,
    missedAttempts: fu?.missedAttempts ?? 0,
    nextActionAt: fu?.nextTask?.dueAt ?? null,
    lastOutcome: last?.type.startsWith('call') ? last.outcome : null,
    now,
  });
  return { ...row, state, mission: missionForBucket(row.scored.queueBucket), hasSubscription };
}

/** Prochaine action la plus proche d'abord, sans action ensuite, puis dernier contact récent. */
export function sortClients(rows: ClientRow[]): ClientRow[] {
  return [...rows].sort((a, b) => {
    const an = a.followUp?.nextTask?.dueAt.getTime() ?? null;
    const bn = b.followUp?.nextTask?.dueAt.getTime() ?? null;
    if (an != null && bn != null && an !== bn) return an - bn;
    if (an != null && bn == null) return -1;
    if (an == null && bn != null) return 1;
    return (b.lastActivity?.at?.getTime() ?? 0) - (a.lastActivity?.at?.getTime() ?? 0);
  });
}

/** Le carnet : toutes les personnes dont ce closer est propriétaire. */
export async function listMyClients(
  closerId: string,
  now: Date = new Date(),
): Promise<ClientRow[]> {
  const rows = await getCallQueue({
    assignedCloserId: closerId,
    includeRecentlyCalled: true,
    withFollowUp: true,
  });
  return sortClients(rows.map((r) => toClientRow(r, now)));
}

export type DayStats = {
  calls: number;
  reached: number;
  meetings: number;
  collectedTodayEur: number;
  /** Null quand la personne n'est pas classée (admin). */
  xpWeek: number | null;
  rankWeek: number | null;
  rankedCount: number;
};

export type CloserDay = {
  now: Date;
  tasks: SplitTasks<CallbackRow>;
  toQualify: ToQualifyRow[];
  /** Personnes du pool réservées par ce closer (« Je prends » actif). */
  reserved: QueueRow[];
  pool: Pool<QueueRow>;
  clients: ClientRow[];
  /** Ses clients sans prochaine action, hors clients et perdus — à planifier. */
  toPlan: ClientRow[];
  stats: DayStats;
  weekTop: LeaderboardEntry[];
};

type StatsRow = { calls: number; reached: number; meetings: number };

export async function getCloserDay(closerId: string, now: Date = new Date()): Promise<CloserDay> {
  const today = parisDateOf(now);
  const startOfDay = parisMidnightUTC(today.year, today.month, today.day);

  const [followUp, ownedRows, poolRows, statsRows, leaderboard, credited] = await Promise.all([
    getFollowUp({ closerId }),
    getCallQueue({ assignedCloserId: closerId, includeRecentlyCalled: true, withFollowUp: true }),
    getCallQueue({ excludeWon: true }),
    db.execute(sql`
      select
        count(*) filter (where type in ('call_outbound', 'call_inbound'))::int as calls,
        count(*) filter (where type in ('call_outbound', 'call_inbound') and outcome = 'reached')::int as reached,
        count(*) filter (where type = 'meeting_booked')::int as meetings
      from interactions
      where user_id = ${closerId} and created_at >= ${startOfDay.toISOString()}::timestamptz
    `) as unknown as Promise<StatsRow[]>,
    // Le classement de la semaine relit toute la table des interactions : une
    // minute de mémoire suffit au bandeau « où j'en suis », qui s'ouvre à
    // chaque retour sur la page.
    cached('closer-day:leaderboard:week', 60_000, () => getLeaderboard('week', now)),
    listCreditedSubscriptions(closerId),
  ]);

  const clients = sortClients(ownedRows.map((r) => toClientRow(r, now)));
  const toPlan = clients
    .filter((c) => !c.followUp?.nextTask && c.state !== 'client' && c.state !== 'lost')
    .sort((a, b) => (b.lastActivity?.at?.getTime() ?? 0) - (a.lastActivity?.at?.getTime() ?? 0));

  const reserved = poolRows.filter((r) => r.claimedById === closerId && !r.assignedCloserId);
  const pool = buildPool(poolRows);

  const s = statsRows[0] ?? { calls: 0, reached: 0, meetings: 0 };
  const entries = leaderboard.entries;
  const myIndex = entries.findIndex((e) => e.closerId === closerId);
  const mine = myIndex >= 0 ? entries[myIndex] : undefined;

  return {
    now,
    tasks: splitTasks(followUp.callbacks, now),
    toQualify: followUp.toQualify,
    reserved,
    pool,
    clients,
    toPlan,
    stats: {
      calls: Number(s.calls) || 0,
      reached: Number(s.reached) || 0,
      meetings: Number(s.meetings) || 0,
      collectedTodayEur: credited
        .filter((c) => c.signedAt.getTime() >= startOfDay.getTime())
        .reduce((t, c) => t + c.amountEur, 0),
      xpWeek: mine?.xpPeriod ?? null,
      rankWeek: myIndex >= 0 ? myIndex + 1 : null,
      rankedCount: entries.length,
    },
    weekTop: entries.slice(0, 3),
  };
}

/**
 * L'ordre du mode appel pour ce closer : réservés, actions dues, pool (pubs
 * d'abord), sa base sans action. Les personnes prises par un collègue sont
 * écartées — un double appel est la pire expérience pour le client.
 */
export async function getSessionLeads(
  closerId: string,
  now: Date = new Date(),
): Promise<QueueRow[]> {
  const day = await getCloserDay(closerId, now);
  const byInvestor = new Map(day.clients.map((c) => [c.id, c]));
  const due = [...day.tasks.overdue, ...day.tasks.dueToday]
    .map((t) => byInvestor.get(t.investorId))
    .filter((c): c is ClientRow => c != null);
  const ordered = sessionOrder({
    reserved: day.reserved,
    due,
    pool: day.pool,
    backlog: day.toPlan,
  });
  return ordered.filter((r) => r.claimedById == null || r.claimedById === closerId);
}

/* ============================================================
   Mes résultats — compléments par période
   ============================================================ */

export type PeriodExtras = {
  /** Personnes devenues ses clients sur la période (première action de sa part). */
  clientsTaken: number;
  /** Dont venues des pubs / dont venues autrement (parrainage, invitation, partenaire). */
  clientsTakenAds: number;
  clientsTakenOther: number;
  /** Délai moyen (minutes) entre l'inscription et son premier appel, nouveaux inscrits de la période. */
  avgFirstCallMinutes: number | null;
};

type ExtrasRow = {
  first_at: string | Date;
  first_call_at: string | Date | null;
  sah_created_at: string | Date | null;
  bonus_code: string | null;
  breach_level: number | string | null;
  parent_sah_id: string | null;
  cgp_name: string | null;
  cgp_network: string | null;
};

export async function getPeriodExtras(
  closerId: string,
  from: Date | null,
  to: Date | null,
): Promise<PeriodExtras> {
  const fromMs = (from ?? new Date(0)).getTime();
  const toMs = (to ?? new Date(Date.now() + 366 * 86_400_000)).getTime();
  const typeList = sql.join(
    CREDIT_ACTION_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );
  const rows = (await db.execute(sql`
    select
      min(ix.created_at) as first_at,
      min(ix.created_at) filter (where ix.type in ('call_outbound', 'call_inbound')) as first_call_at,
      i.sah_created_at,
      i.bonus_code,
      i.breach_level,
      i.parent_sah_id,
      i.cgp_name,
      i.cgp_network
    from investors i
    join interactions ix
      on ix.investor_id = i.id and ix.user_id = ${closerId} and ix.type in (${typeList})
    where i.deleted_at is null and i.assigned_closer_id = ${closerId}
    group by i.id, i.sah_created_at, i.bonus_code, i.breach_level, i.parent_sah_id, i.cgp_name, i.cgp_network
  `)) as unknown as ExtrasRow[];

  let taken = 0;
  let takenAds = 0;
  let delaySum = 0;
  let delayCount = 0;
  for (const r of rows) {
    const firstAt = new Date(r.first_at).getTime();
    if (firstAt < fromMs || firstAt >= toMs) continue;
    taken += 1;
    const origin = investorOrigin({
      bonusCode: r.bonus_code,
      breachLevel: r.breach_level != null ? Number(r.breach_level) : null,
      parentSahId: r.parent_sah_id,
      cgpName: r.cgp_name,
      cgpNetwork: r.cgp_network,
    });
    if (originGroup(origin) === 'ads') takenAds += 1;
    // Délai avant le premier appel : seulement les nouveaux inscrits de la période.
    if (r.sah_created_at && r.first_call_at) {
      const signedUp = new Date(r.sah_created_at).getTime();
      const firstCall = new Date(r.first_call_at).getTime();
      if (signedUp >= fromMs && signedUp < toMs && firstCall >= signedUp) {
        delaySum += (firstCall - signedUp) / 60_000;
        delayCount += 1;
      }
    }
  }
  return {
    clientsTaken: taken,
    clientsTakenAds: takenAds,
    clientsTakenOther: taken - takenAds,
    avgFirstCallMinutes: delayCount > 0 ? Math.round(delaySum / delayCount) : null,
  };
}
