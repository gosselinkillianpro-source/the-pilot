import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Liste des souscriptions (vue closing) : dernières + liste déployable.
 *
 * Comptage global = souscriptions NON annulées (payées + signées) ; les annulées
 * (canceled_at renseigné côté SAH) sont affichées mais exclues du total collecté.
 * Lecture seule. Miroir SAH.
 */

export type SubStatus = 'signed' | 'paid' | 'active' | 'repaid' | 'cancelled';

export type SubRow = {
  id: string;
  investorId: string;
  investorName: string | null;
  projectName: string | null;
  amount: number;
  status: SubStatus;
  signedAt: Date | null;
  paidAt: Date | null;
  canceledAt: Date | null;
  isBreach: boolean;
  bonusCode: string | null;
};

export type SubscriptionsView = {
  rows: SubRow[];
  totals: {
    collecte: number; // payées + signées (non annulées)
    count: number;
    cancelledAmount: number;
    cancelledCount: number;
    avgTicket: number;
  };
  hasMore: boolean;
  limit: number;
};

export type SubScope = 'all' | 'breach';

type Row = Record<string, string | number | boolean | Date | null>;
const n = (v: unknown) => Number(v) || 0;
const d = (v: unknown) => (v ? new Date(v as string) : null);

export async function getSubscriptionsList(opts: {
  scope: SubScope;
  limit: number;
}): Promise<SubscriptionsView> {
  const { scope, limit } = opts;
  const breachFilter =
    scope === 'breach'
      ? sql`and (i.breach_level is not null or i.bonus_code ilike '%breach%')`
      : sql``;

  const [totalsR, rowsR] = await Promise.all([
    db.execute(sql`
      select
        coalesce(sum(s.amount) filter (where s.status <> 'cancelled'), 0) as collecte,
        count(*) filter (where s.status <> 'cancelled')::int as cnt,
        coalesce(sum(s.amount) filter (where s.status = 'cancelled'), 0) as cancelled_amount,
        count(*) filter (where s.status = 'cancelled')::int as cancelled_count,
        count(distinct s.investor_id) filter (where s.status <> 'cancelled')::int as investors
      from subscriptions s
      join investors i on i.id = s.investor_id
      where i.deleted_at is null ${breachFilter}
    `),
    db.execute(sql`
      select
        s.id::text as id,
        i.id::text as investor_id,
        i.full_name as investor_name,
        p.name as project_name,
        s.amount,
        s.status,
        s.signed_at,
        s.paid_at,
        s.canceled_at,
        i.bonus_code,
        i.breach_level
      from subscriptions s
      join investors i on i.id = s.investor_id
      left join projects p on p.id = s.project_id
      where i.deleted_at is null ${breachFilter}
      order by coalesce(s.paid_at, s.signed_at, s.canceled_at) desc nulls last, s.id desc
      limit ${limit + 1}
    `),
  ]);

  const t = (totalsR as unknown as Row[])[0] ?? {};
  const raw = rowsR as unknown as Row[];
  const hasMore = raw.length > limit;
  const rows: SubRow[] = raw.slice(0, limit).map((r) => {
    const code = (r.bonus_code as string) ?? null;
    return {
      id: String(r.id),
      investorId: String(r.investor_id),
      investorName: (r.investor_name as string) ?? null,
      projectName: (r.project_name as string) ?? null,
      amount: n(r.amount),
      status: (r.status as SubStatus) ?? 'signed',
      signedAt: d(r.signed_at),
      paidAt: d(r.paid_at),
      canceledAt: d(r.canceled_at),
      isBreach: r.breach_level != null || (code != null && /breach/i.test(code)),
      bonusCode: code,
    };
  });

  const collecte = n(t.collecte);
  const investors = n(t.investors);
  return {
    rows,
    totals: {
      collecte,
      count: n(t.cnt),
      cancelledAmount: n(t.cancelled_amount),
      cancelledCount: n(t.cancelled_count),
      avgTicket: investors > 0 ? Math.round(collecte / investors) : 0,
    },
    hasMore,
    limit,
  };
}
