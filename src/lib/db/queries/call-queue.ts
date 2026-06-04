import 'server-only';
import { sql } from 'drizzle-orm';
import { compareForQueue, type ScoredInvestor, scoreInvestor } from '@/lib/closing/scoring';
import { db } from '@/lib/db';

export type QueueRow = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  assignedCloserId: string | null;
  pipelineStage: string;
  totalInvested: number;
  scored: ScoredInvestor;
};

type RawRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  address_city: string | null;
  registration_complete: boolean;
  onboarding_complete: boolean;
  assigned_closer_id: string | null;
  pipeline_stage: string;
  sah_created_at: string | Date | null;
  total_invested: string | number | null;
  active_subscriptions: string | number | null;
  active_projects: string | number | null;
  nearest_repayment: string | Date | null;
};

const DAY_MS = 86_400_000;

/**
 * Construit la file d'appels priorisée : un score par investisseur, trié par file
 * (ordre de traitement de la journée) puis par priorité. L'échéance de remboursement
 * est reconstituée ici (date de souscription + durée du projet) — signal clé du scoring.
 */
export async function getCallQueue(opts?: {
  assignedCloserId?: string;
  excludeWon?: boolean;
}): Promise<QueueRow[]> {
  const now = new Date();
  const closerFilter = opts?.assignedCloserId
    ? sql`and i.assigned_closer_id = ${opts.assignedCloserId}`
    : sql``;
  // On exclut les leads déjà clos (gagné/perdu) de la file d'appels.
  const stageFilter = opts?.excludeWon
    ? sql`and i.pipeline_stage not in ('closed_won', 'closed_lost')`
    : sql``;

  const result = await db.execute(sql`
    select
      i.id::text as id,
      i.full_name,
      i.email,
      i.phone,
      i.address_city,
      i.registration_complete,
      i.onboarding_complete,
      i.assigned_closer_id::text as assigned_closer_id,
      i.pipeline_stage,
      i.sah_created_at,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      count(s.id) filter (where s.status <> 'cancelled') as active_subscriptions,
      count(distinct s.project_id) filter (
        where s.status <> 'cancelled'
          and p.status in ('open', 'funding', 'funded', 'in_operation', 'repaying')
      ) as active_projects,
      min(
        case
          when s.status <> 'cancelled'
            and s.signed_at is not null
            and p.duration_months is not null
            and (s.signed_at + make_interval(months => p.duration_months)) > now()
          then (s.signed_at + make_interval(months => p.duration_months))
        end
      ) as nearest_repayment
    from investors i
    left join subscriptions s on s.investor_id = i.id
    left join projects p on p.id = s.project_id
    where i.deleted_at is null
    ${closerFilter}
    ${stageFilter}
    group by i.id
  `);

  const rows = result as unknown as RawRow[];

  const queue: QueueRow[] = rows.map((r) => {
    const totalInvested = Number(r.total_invested) || 0;
    const nearestRepaymentDays = r.nearest_repayment
      ? Math.ceil((new Date(r.nearest_repayment).getTime() - now.getTime()) / DAY_MS)
      : null;
    const scored = scoreInvestor({
      registrationComplete: r.registration_complete,
      onboardingComplete: r.onboarding_complete,
      sahCreatedAt: r.sah_created_at ? new Date(r.sah_created_at) : null,
      totalInvested,
      activeSubscriptions: Number(r.active_subscriptions) || 0,
      activeProjectsCount: Number(r.active_projects) || 0,
      nearestRepaymentDays,
      now,
    });
    return {
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.address_city,
      registrationComplete: r.registration_complete,
      onboardingComplete: r.onboarding_complete,
      assignedCloserId: r.assigned_closer_id,
      pipelineStage: r.pipeline_stage,
      totalInvested,
      scored,
    };
  });

  queue.sort((a, b) => compareForQueue(a.scored, b.scored));
  return queue;
}

export type QueueBucketGroup = {
  bucket: number;
  label: string;
  goal: string;
  rows: QueueRow[];
};

/** Regroupe la file par "file d'appel" (bucket), dans l'ordre de traitement. */
export function groupByBucket(queue: QueueRow[]): QueueBucketGroup[] {
  const map = new Map<number, QueueBucketGroup>();
  for (const row of queue) {
    const b = row.scored.queueBucket;
    let g = map.get(b);
    if (!g) {
      g = { bucket: b, label: row.scored.queueLabel, goal: row.scored.callGoal, rows: [] };
      map.set(b, g);
    }
    g.rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.bucket - b.bucket);
}
