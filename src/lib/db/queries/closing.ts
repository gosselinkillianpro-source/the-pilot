import 'server-only';
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { attributeAction, type Contact, type ContactKind } from '@/lib/closing/attribution';
import { db } from '@/lib/db';
import { closerTasks, interactions, investors, subscriptions, users } from '@/lib/db/schema';
import { type Delta, delta, type ResolvedPeriod } from '@/lib/period';

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

export type InvestorOpenTask = {
  id: string;
  type: string;
  dueAt: Date;
  note: string | null;
  closerName: string | null;
  overdue: boolean;
};

/** Actions/rappels en attente d'un investisseur (carte « Actions à venir » sur la fiche). */
export async function getInvestorOpenTasks(investorId: string): Promise<InvestorOpenTask[]> {
  if (!UUID_RE.test(investorId)) return [];
  const now = Date.now();
  const rows = await db
    .select({
      id: closerTasks.id,
      type: closerTasks.type,
      dueAt: closerTasks.dueAt,
      note: closerTasks.note,
      closerName: users.fullName,
    })
    .from(closerTasks)
    .leftJoin(users, eq(closerTasks.closerId, users.id))
    .where(and(eq(closerTasks.investorId, investorId), eq(closerTasks.status, 'pending')))
    .orderBy(closerTasks.dueAt);
  return rows.map((r) => ({ ...r, overdue: new Date(r.dueAt).getTime() < now }));
}

/** Rang « avancement » dans le tunnel (pour détecter une progression après un appel). */
const STAGE_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  meeting_booked: 2,
  meeting_done: 3,
  proposal_sent: 4,
  closed_won: 5,
  closed_lost: -1,
  dormant: -1,
};

export type CallImpact = {
  lastCallAt: Date;
  outcome: string | null;
  stageAtCall: string | null;
  currentStage: string;
  stageProgressed: boolean;
  investedAfterCount: number;
  investedAfterAmount: number;
};

/**
 * « L'appel a-t-il servi ? » pour une personne : on regarde, après son dernier appel,
 * s'il y a eu une progression d'étape ou un investissement (dans les 30 jours).
 * C'est la mesure de rentabilité d'un appel, côté fiche.
 */
export async function getCallImpact(investorId: string): Promise<CallImpact | null> {
  if (!UUID_RE.test(investorId)) return null;

  const calls = await db
    .select({
      at: interactions.createdAt,
      outcome: interactions.outcome,
      metadata: interactions.metadata,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.investorId, investorId),
        inArray(interactions.type, ['call_outbound', 'call_inbound']),
      ),
    )
    .orderBy(desc(interactions.createdAt))
    .limit(1);
  const last = calls[0];
  if (!last) return null;
  const lastCallAt = new Date(last.at);
  const meta = (last.metadata ?? {}) as { stageAtCall?: string | null };
  const stageAtCall = meta.stageAtCall ?? null;

  const inv = await db
    .select({
      stage: investors.pipelineStage,
      stageUpdatedAt: investors.pipelineStageUpdatedAt,
    })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  const currentStage = inv[0]?.stage ?? 'new';
  const stageUpdatedAt = inv[0]?.stageUpdatedAt ?? null;

  const rankNow = STAGE_RANK[currentStage] ?? 0;
  const rankAtCall = stageAtCall ? (STAGE_RANK[stageAtCall] ?? 0) : 0;
  const stageProgressed =
    stageAtCall != null &&
    rankNow > rankAtCall &&
    rankNow >= 1 &&
    stageUpdatedAt != null &&
    new Date(stageUpdatedAt).getTime() >= lastCallAt.getTime();

  const windowEnd = new Date(lastCallAt.getTime() + 30 * 86_400_000);
  const subAgg = await db
    .select({
      n: count(),
      amount: sql<string>`coalesce(sum(${subscriptions.amount}), 0)`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.investorId, investorId),
        sql`${subscriptions.status} <> 'cancelled'`,
        gte(subscriptions.signedAt, lastCallAt),
        lte(subscriptions.signedAt, windowEnd),
      ),
    );

  return {
    lastCallAt,
    outcome: last.outcome,
    stageAtCall,
    currentStage,
    stageProgressed,
    investedAfterCount: Number(subAgg[0]?.n) || 0,
    investedAfterAmount: Number(subAgg[0]?.amount) || 0,
  };
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

export type FunnelStage = { stage: string; label: string; total: number };

/** Comptage des personnes par étape du tunnel (vue tunnel lecture seule). */
export async function getPipelineFunnel(): Promise<FunnelStage[]> {
  const rows = await db
    .select({ stage: investors.pipelineStage, n: count() })
    .from(investors)
    .where(isNull(investors.deletedAt))
    .groupBy(investors.pipelineStage);
  const map = new Map(rows.map((r) => [r.stage, Number(r.n)]));
  return PIPELINE_STAGES.map((s) => ({
    stage: s.value,
    label: s.label,
    total: map.get(s.value) ?? 0,
  }));
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
  periodLabel: string;
  deltas: { calls: Delta; collecte: Delta };
};

const EMAIL_KIND: Record<string, ContactKind> = {
  email_clicked: 'click',
  email_opened: 'open',
};

/**
 * Performance par closer + attribution des souscriptions (appel prime / last-touch / 30j).
 * Se remplit au fur et à mesure que les closers enregistrent des appels.
 */
export async function getCloserPerformance(period: ResolvedPeriod): Promise<PerformanceReport> {
  const closers = await getClosers();
  const from = new Date(period.fromISO);
  const to = new Date(period.toISO);

  // Activité d'appel par closer SUR LA PÉRIODE
  const callAgg = await db
    .select({
      userId: interactions.userId,
      calls: count(),
      reached: sql<number>`count(*) filter (where ${interactions.outcome} = 'reached')::int`,
    })
    .from(interactions)
    .where(
      and(
        inArray(interactions.type, ['call_outbound', 'call_inbound']),
        gte(interactions.createdAt, from),
        lt(interactions.createdAt, to),
      ),
    )
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
    .where(
      sql`${subscriptions.status} <> 'cancelled' and ${subscriptions.signedAt} >= ${period.fromISO}::timestamptz and ${subscriptions.signedAt} < ${period.toISO}::timestamptz`,
    );

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

  // Deltas globaux : appels + collecte signée, période courante vs précédente.
  const { fromISO, toISO, prevFromISO, prevToISO } = period;
  const callsDelta = (await db.execute(sql`
    select
      count(*) filter (where created_at >= ${fromISO}::timestamptz and created_at < ${toISO}::timestamptz)::int as cur,
      count(*) filter (where created_at >= ${prevFromISO}::timestamptz and created_at < ${prevToISO}::timestamptz)::int as prev
    from interactions where type in ('call_outbound', 'call_inbound')
  `)) as unknown as { cur: number; prev: number }[];
  const colDelta = (await db.execute(sql`
    select
      coalesce(sum(amount) filter (where signed_at >= ${fromISO}::timestamptz and signed_at < ${toISO}::timestamptz), 0) as cur,
      coalesce(sum(amount) filter (where signed_at >= ${prevFromISO}::timestamptz and signed_at < ${prevToISO}::timestamptz), 0) as prev
    from subscriptions where status <> 'cancelled' and signed_at is not null
  `)) as unknown as { cur: string | number; prev: string | number }[];
  const cd = callsDelta[0] ?? { cur: 0, prev: 0 };
  const md = colDelta[0] ?? { cur: 0, prev: 0 };

  return {
    closers: closerPerf,
    unattributed: { count: unattrCount, amount: unattrAmount },
    totalSubs: subs.length,
    totalAmount,
    periodLabel: period.label,
    deltas: {
      calls: delta(Number(cd.cur) || 0, Number(cd.prev) || 0),
      collecte: delta(Math.round(Number(md.cur) || 0), Math.round(Number(md.prev) || 0)),
    },
  };
}

export type BreachStats = {
  funnel: {
    total: number;
    registered: number;
    onboarded: number;
    investors: number; // ont au moins une souscription
    new7d: number;
    new30d: number;
  };
  totalInvested: number;
  subCount: number;
  walletTotal: number; // solde portefeuille cumulé (€)
  avgTicketPerInvestor: number;
  avgPerSub: number;
  avgDaysToFirstSub: number | null; // délai moyen inscription → 1re souscription
  byCode: { code: string; total: number; onboarded: number; invested: number }[];
  byCity: { city: string; total: number }[];
  byMonth: { month: string; signups: number }[];
  topProjects: { name: string; investors: number; collected: number }[];
  // Évolution sur la période choisie vs période précédente équivalente (gain/perte € et %)
  period: {
    label: string;
    leads: Delta;
    collecte: Delta;
    subs: Delta;
    investors: Delta;
    avgTicket: Delta;
    avgPerSub: Delta;
  };
  // Référence pour comparer : hors BREACH
  otherTotal: number;
  otherOnboarded: number;
  otherInvestors: number;
  otherInvested: number;
  otherAvgTicketPerInvestor: number;
};

type FunnelRow = {
  total: number;
  registered: number;
  onboarded: number;
  new7d: number;
  new30d: number;
  wallet_cents: string | number;
};
type InvestedRow = { investors: number; total_invested: string | number; sub_count: number };
type CodeRow = {
  bonus_code: string | null;
  total: number;
  onboarded: number;
  invested: string | number;
};
type OtherRow = {
  total: number;
  onboarded: number;
  investors: number;
  total_invested: string | number;
};
type CityRow = { address_city: string | null; total: number };
type MonthRow = { month: string; signups: number };
type ProjRow = { name: string | null; investors: number; collected: string | number };
type TimingRow = { avg_days: string | number | null };

/**
 * Toutes les stats des leads venant des pubs de Killian (code bonus contenant BREACH).
 * @param period fenêtre d'analyse + période précédente (pour le gain/perte).
 */
export async function getBreachStats(period: ResolvedPeriod): Promise<BreachStats> {
  const funnel = (await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where registration_complete)::int as registered,
      count(*) filter (where onboarding_complete)::int as onboarded,
      count(*) filter (where sah_created_at >= now() - interval '7 days')::int as new7d,
      count(*) filter (where sah_created_at >= now() - interval '30 days')::int as new30d,
      coalesce(sum(coalesce(wallet_balance_cents, 0)), 0) as wallet_cents
    from investors
    where deleted_at is null and (breach_level is not null or bonus_code ilike '%breach%')
  `)) as unknown as FunnelRow[];

  const invested = (await db.execute(sql`
    select
      count(distinct s.investor_id)::int as investors,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      count(s.id) filter (where s.status <> 'cancelled')::int as sub_count
    from subscriptions s
    join investors i on i.id = s.investor_id
    where (i.breach_level is not null or i.bonus_code ilike '%breach%')
  `)) as unknown as InvestedRow[];

  const byCode = (await db.execute(sql`
    select
      i.bonus_code,
      count(distinct i.id)::int as total,
      count(distinct i.id) filter (where i.onboarding_complete)::int as onboarded,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as invested
    from investors i
    left join subscriptions s on s.investor_id = i.id
    where i.deleted_at is null and (i.breach_level is not null or i.bonus_code ilike '%breach%')
    group by i.bonus_code
    order by total desc
  `)) as unknown as CodeRow[];

  const byCity = (await db.execute(sql`
    select address_city, count(*)::int as total
    from investors
    where deleted_at is null and (breach_level is not null or bonus_code ilike '%breach%') and address_city is not null
    group by address_city order by total desc limit 8
  `)) as unknown as CityRow[];

  const byMonth = (await db.execute(sql`
    select to_char(date_trunc('month', sah_created_at), 'YYYY-MM') as month, count(*)::int as signups
    from investors
    where deleted_at is null and (breach_level is not null or bonus_code ilike '%breach%') and sah_created_at is not null
    group by month order by month desc limit 6
  `)) as unknown as MonthRow[];

  const topProjects = (await db.execute(sql`
    select p.name,
      count(distinct s.investor_id)::int as investors,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected
    from subscriptions s
    join investors i on i.id = s.investor_id
    join projects p on p.id = s.project_id
    where (i.breach_level is not null or i.bonus_code ilike '%breach%')
    group by p.name order by collected desc limit 8
  `)) as unknown as ProjRow[];

  const timing = (await db.execute(sql`
    select avg(extract(epoch from (fs.first_signed - i.sah_created_at)) / 86400) as avg_days
    from investors i
    join (
      select investor_id, min(signed_at) as first_signed
      from subscriptions where status <> 'cancelled' and signed_at is not null
      group by investor_id
    ) fs on fs.investor_id = i.id
    where (i.breach_level is not null or i.bonus_code ilike '%breach%') and i.sah_created_at is not null
  `)) as unknown as TimingRow[];

  const other = (await db.execute(sql`
    select
      count(distinct i.id)::int as total,
      count(distinct i.id) filter (where i.onboarding_complete)::int as onboarded,
      count(distinct s.investor_id)::int as investors,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested
    from investors i
    left join subscriptions s on s.investor_id = i.id
    where i.deleted_at is null
      and i.breach_level is null
      and (i.bonus_code is null or i.bonus_code not ilike '%breach%')
  `)) as unknown as OtherRow[];

  // Évolution sur la période choisie vs période précédente (bornes explicites).
  const { fromISO, toISO, prevFromISO, prevToISO } = period;
  const leadsP = (await db.execute(sql`
    select
      count(*) filter (where sah_created_at >= ${fromISO}::timestamptz and sah_created_at < ${toISO}::timestamptz)::int as cur,
      count(*) filter (where sah_created_at >= ${prevFromISO}::timestamptz and sah_created_at < ${prevToISO}::timestamptz)::int as prev
    from investors
    where deleted_at is null and (breach_level is not null or bonus_code ilike '%breach%') and sah_created_at is not null
  `)) as unknown as { cur: number; prev: number }[];

  const subsP = (await db.execute(sql`
    select
      coalesce(sum(s.amount) filter (where s.signed_at >= ${fromISO}::timestamptz and s.signed_at < ${toISO}::timestamptz), 0) as cur_collecte,
      coalesce(sum(s.amount) filter (where s.signed_at >= ${prevFromISO}::timestamptz and s.signed_at < ${prevToISO}::timestamptz), 0) as prev_collecte,
      count(*) filter (where s.signed_at >= ${fromISO}::timestamptz and s.signed_at < ${toISO}::timestamptz)::int as cur_subs,
      count(*) filter (where s.signed_at >= ${prevFromISO}::timestamptz and s.signed_at < ${prevToISO}::timestamptz)::int as prev_subs,
      count(distinct s.investor_id) filter (where s.signed_at >= ${fromISO}::timestamptz and s.signed_at < ${toISO}::timestamptz)::int as cur_inv,
      count(distinct s.investor_id) filter (where s.signed_at >= ${prevFromISO}::timestamptz and s.signed_at < ${prevToISO}::timestamptz)::int as prev_inv
    from subscriptions s
    join investors i on i.id = s.investor_id
    where (i.breach_level is not null or i.bonus_code ilike '%breach%') and s.status <> 'cancelled' and s.signed_at is not null
  `)) as unknown as {
    cur_collecte: string | number;
    prev_collecte: string | number;
    cur_subs: number;
    prev_subs: number;
    cur_inv: number;
    prev_inv: number;
  }[];

  const lp = leadsP[0] ?? { cur: 0, prev: 0 };
  const sp = subsP[0] ?? {
    cur_collecte: 0,
    prev_collecte: 0,
    cur_subs: 0,
    prev_subs: 0,
    cur_inv: 0,
    prev_inv: 0,
  };
  const curCollecte = Math.round(Number(sp.cur_collecte) || 0);
  const prevCollecte = Math.round(Number(sp.prev_collecte) || 0);
  const curSubs = Number(sp.cur_subs) || 0;
  const prevSubs = Number(sp.prev_subs) || 0;
  const curInv = Number(sp.cur_inv) || 0;
  const prevInv = Number(sp.prev_inv) || 0;
  const periodBlock: BreachStats['period'] = {
    label: period.label,
    leads: delta(Number(lp.cur) || 0, Number(lp.prev) || 0),
    collecte: delta(curCollecte, prevCollecte),
    subs: delta(curSubs, prevSubs),
    investors: delta(curInv, prevInv),
    avgTicket: delta(
      curInv > 0 ? Math.round(curCollecte / curInv) : 0,
      prevInv > 0 ? Math.round(prevCollecte / prevInv) : 0,
    ),
    avgPerSub: delta(
      curSubs > 0 ? Math.round(curCollecte / curSubs) : 0,
      prevSubs > 0 ? Math.round(prevCollecte / prevSubs) : 0,
    ),
  };

  const f = funnel[0] ?? {
    total: 0,
    registered: 0,
    onboarded: 0,
    new7d: 0,
    new30d: 0,
    wallet_cents: 0,
  };
  const inv = invested[0] ?? { investors: 0, total_invested: 0, sub_count: 0 };
  const o = other[0] ?? { total: 0, onboarded: 0, investors: 0, total_invested: 0 };

  const totalInvested = Number(inv.total_invested) || 0;
  const investors = Number(inv.investors) || 0;
  const subCount = Number(inv.sub_count) || 0;
  const avgDays = timing[0]?.avg_days != null ? Number(timing[0].avg_days) : null;
  const otherInvestors = Number(o.investors) || 0;
  const otherInvested = Number(o.total_invested) || 0;

  return {
    funnel: {
      total: Number(f.total),
      registered: Number(f.registered),
      onboarded: Number(f.onboarded),
      investors,
      new7d: Number(f.new7d),
      new30d: Number(f.new30d),
    },
    totalInvested,
    subCount,
    walletTotal: Math.round((Number(f.wallet_cents) || 0) / 100),
    avgTicketPerInvestor: investors > 0 ? Math.round(totalInvested / investors) : 0,
    avgPerSub: subCount > 0 ? Math.round(totalInvested / subCount) : 0,
    avgDaysToFirstSub: avgDays != null ? Math.round(avgDays) : null,
    byCode: byCode.map((c) => ({
      code: c.bonus_code ?? '(sans code)',
      total: Number(c.total),
      onboarded: Number(c.onboarded),
      invested: Number(c.invested) || 0,
    })),
    byCity: byCity.map((c) => ({ city: c.address_city ?? '—', total: Number(c.total) })),
    byMonth: byMonth.map((m) => ({ month: m.month, signups: Number(m.signups) })).reverse(),
    topProjects: topProjects.map((p) => ({
      name: p.name ?? '—',
      investors: Number(p.investors),
      collected: Number(p.collected) || 0,
    })),
    period: periodBlock,
    otherTotal: Number(o.total),
    otherOnboarded: Number(o.onboarded),
    otherInvestors,
    otherInvested,
    otherAvgTicketPerInvestor: otherInvestors > 0 ? Math.round(otherInvested / otherInvestors) : 0,
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
