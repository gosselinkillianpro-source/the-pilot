import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Portefeuille d'un closer : les personnes qui lui sont attribuées, avec leur état
 * à jour (étape, dernier appel + résultat, prochaine action prévue, montant investi).
 * C'est la « to-do vivante » du closer — la personne ne disparaît plus après l'appel.
 */

export type PortfolioRow = {
  id: string;
  fullName: string | null;
  city: string | null;
  stage: string;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  assignedCloserId: string | null;
  assignedCloserName: string | null;
  totalInvested: number;
  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  nextActionAt: Date | null;
  nextActionType: string | null;
};

type RawPortfolioRow = {
  id: string;
  full_name: string | null;
  city: string | null;
  stage: string;
  registration_complete: boolean;
  onboarding_complete: boolean;
  assigned_closer_id: string | null;
  assigned_closer_name: string | null;
  total_invested: string | number | null;
  last_call_at: string | Date | null;
  last_call_outcome: string | null;
  next_action_at: string | Date | null;
  next_action_type: string | null;
};

export async function getCloserPortfolio(opts?: { closerId?: string }): Promise<PortfolioRow[]> {
  const closerFilter = opts?.closerId ? sql`and i.assigned_closer_id = ${opts.closerId}` : sql``;

  const result = await db.execute(sql`
    select
      i.id::text as id,
      i.full_name,
      i.address_city as city,
      i.pipeline_stage as stage,
      i.registration_complete,
      i.onboarding_complete,
      i.assigned_closer_id::text as assigned_closer_id,
      au.full_name as assigned_closer_name,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      lc.created_at as last_call_at,
      lc.outcome as last_call_outcome,
      na.due_at as next_action_at,
      na.type as next_action_type
    from investors i
    left join users au on au.id = i.assigned_closer_id
    left join subscriptions s on s.investor_id = i.id
    left join lateral (
      select created_at, outcome from interactions ix
      where ix.investor_id = i.id and ix.type in ('call_outbound', 'call_inbound')
      order by created_at desc limit 1
    ) lc on true
    left join lateral (
      select due_at, type from closer_tasks ct
      where ct.investor_id = i.id and ct.status = 'pending'
      order by due_at asc limit 1
    ) na on true
    where i.deleted_at is null and i.assigned_closer_id is not null
    ${closerFilter}
    group by i.id, au.full_name, lc.created_at, lc.outcome, na.due_at, na.type
  `);

  const rows = result as unknown as RawPortfolioRow[];

  return rows
    .map((r) => ({
      id: r.id,
      fullName: r.full_name,
      city: r.city,
      stage: r.stage,
      registrationComplete: r.registration_complete,
      onboardingComplete: r.onboarding_complete,
      assignedCloserId: r.assigned_closer_id,
      assignedCloserName: r.assigned_closer_name,
      totalInvested: Number(r.total_invested) || 0,
      lastCallAt: r.last_call_at ? new Date(r.last_call_at) : null,
      lastCallOutcome: r.last_call_outcome,
      nextActionAt: r.next_action_at ? new Date(r.next_action_at) : null,
      nextActionType: r.next_action_type,
    }))
    .sort((a, b) => {
      // Du plus récemment appelé au plus ancien ; jamais appelés (null) en dernier.
      const al = a.lastCallAt?.getTime() ?? null;
      const bl = b.lastCallAt?.getTime() ?? null;
      if (al === null && bl === null) return 0;
      if (al === null) return 1;
      if (bl === null) return -1;
      return bl - al;
    });
}
