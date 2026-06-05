import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Données de la page « Suivi / À recontacter » : où atterrissent les personnes appelées.
 * - toQualify : dernier appel sans résultat renseigné (= on a cliqué « Appelé », à qualifier).
 * - callbacks : rappels & actions programmés en attente (à venir + en retard).
 * - kpis : appelés (7 j), à qualifier, rappels, conversions (30 j après un appel).
 */

export type ToQualifyRow = {
  callId: string;
  investorId: string;
  fullName: string | null;
  phone: string | null;
  calledAt: Date;
  note: string | null;
  assignedCloserName: string | null;
};

export type CallbackRow = {
  taskId: string;
  investorId: string;
  fullName: string | null;
  phone: string | null;
  type: string;
  dueAt: Date;
  note: string | null;
  assignedCloserName: string | null;
  overdue: boolean;
};

export type FollowUpData = {
  toQualify: ToQualifyRow[];
  callbacks: CallbackRow[];
  kpis: { calledLast7d: number; toQualify: number; callbacks: number; conversions30d: number };
};

type QualifyRaw = {
  call_id: string;
  investor_id: string;
  called_at: string | Date;
  outcome: string | null;
  note: string | null;
  full_name: string | null;
  phone: string | null;
  assigned_closer_name: string | null;
};

type CallbackRaw = {
  task_id: string;
  investor_id: string;
  type: string;
  due_at: string | Date;
  note: string | null;
  full_name: string | null;
  phone: string | null;
  assigned_closer_name: string | null;
};

export async function getFollowUp(opts?: { closerId?: string }): Promise<FollowUpData> {
  const now = new Date();
  const closerFilterInv = opts?.closerId ? sql`and i.assigned_closer_id = ${opts.closerId}` : sql``;
  const closerFilterTask = opts?.closerId ? sql`and ct.closer_id = ${opts.closerId}` : sql``;

  // 1. Dernier appel de chaque personne (21 derniers jours) ; on ne gardera que ceux
  //    dont le dernier appel n'a pas encore de résultat renseigné (à qualifier).
  const qualifyRaw = (await db.execute(sql`
    select distinct on (ix.investor_id)
      ix.id::text as call_id,
      ix.investor_id::text as investor_id,
      ix.created_at as called_at,
      ix.outcome,
      ix.note,
      i.full_name,
      i.phone,
      au.full_name as assigned_closer_name
    from interactions ix
    join investors i on i.id = ix.investor_id
    left join users au on au.id = i.assigned_closer_id
    where ix.type in ('call_outbound', 'call_inbound')
      and ix.created_at >= now() - interval '21 days'
      and i.deleted_at is null
      ${closerFilterInv}
    order by ix.investor_id, ix.created_at desc
  `)) as unknown as QualifyRaw[];

  const toQualify: ToQualifyRow[] = qualifyRaw
    .filter((r) => r.outcome == null)
    .map((r) => ({
      callId: r.call_id,
      investorId: r.investor_id,
      fullName: r.full_name,
      phone: r.phone,
      calledAt: new Date(r.called_at),
      note: r.note,
      assignedCloserName: r.assigned_closer_name,
    }))
    .sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime());

  // 2. Rappels / actions programmés en attente.
  const callbackRaw = (await db.execute(sql`
    select
      ct.id::text as task_id,
      ct.investor_id::text as investor_id,
      ct.type,
      ct.due_at,
      ct.note,
      i.full_name,
      i.phone,
      au.full_name as assigned_closer_name
    from closer_tasks ct
    join investors i on i.id = ct.investor_id
    left join users au on au.id = i.assigned_closer_id
    where ct.status = 'pending'
      ${closerFilterTask}
    order by ct.due_at asc
    limit 200
  `)) as unknown as CallbackRaw[];

  const callbacks: CallbackRow[] = callbackRaw.map((r) => {
    const dueAt = new Date(r.due_at);
    return {
      taskId: r.task_id,
      investorId: r.investor_id,
      fullName: r.full_name,
      phone: r.phone,
      type: r.type,
      dueAt,
      note: r.note,
      assignedCloserName: r.assigned_closer_name,
      overdue: dueAt.getTime() < now.getTime(),
    };
  });

  // 3. KPIs.
  const calledRaw = (await db.execute(sql`
    select count(distinct investor_id)::int as n
    from interactions
    where type in ('call_outbound', 'call_inbound') and created_at >= now() - interval '7 days'
  `)) as unknown as { n: number }[];

  const convRaw = (await db.execute(sql`
    select count(distinct ix.investor_id)::int as n
    from interactions ix
    join subscriptions s on s.investor_id = ix.investor_id
      and s.status <> 'cancelled'
      and s.signed_at >= ix.created_at
      and s.signed_at <= ix.created_at + interval '30 days'
    where ix.type in ('call_outbound', 'call_inbound')
      and ix.created_at >= now() - interval '60 days'
  `)) as unknown as { n: number }[];

  return {
    toQualify,
    callbacks,
    kpis: {
      calledLast7d: Number(calledRaw[0]?.n) || 0,
      toQualify: toQualify.length,
      callbacks: callbacks.length,
      conversions30d: Number(convRaw[0]?.n) || 0,
    },
  };
}
