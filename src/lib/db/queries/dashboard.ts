import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type Delta, delta, type ResolvedPeriod } from '@/lib/period';

/**
 * Statistiques globales Seven At Home pour le dashboard d'accueil.
 * Données réelles (miroir SAH) : funnel, collecte, projets, BREACH.
 */
export type GlobalStats = {
  investors: {
    total: number;
    registered: number;
    onboarded: number;
    newMonth: number;
    new7d: number;
  };
  breachLeads: number;
  collecte: { total: number; subs: number; investors: number; month: number; avgTicket: number };
  breachCollecte: number;
  projects: { total: number; open: number };
  topProjects: { id: string; name: string; collected: number; investors: number }[];
  byMonth: { month: string; collected: number }[];
  // Sur la période choisie : flux + gain/perte vs période précédente.
  period: { label: string; leads: Delta; collecte: Delta; subs: Delta; investors: Delta };
};

type Row = Record<string, string | number | null>;

export async function getGlobalStats(period: ResolvedPeriod): Promise<GlobalStats> {
  const { fromISO, toISO, prevFromISO, prevToISO } = period;
  const [invR, subR, breachR, projR, topR, monthR, leadsPR, subsPR] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where registration_complete)::int as registered,
        count(*) filter (where onboarding_complete)::int as onboarded,
        count(*) filter (where sah_created_at >= date_trunc('month', now()))::int as new_month,
        count(*) filter (where sah_created_at >= now() - interval '7 days')::int as new7d,
        count(*) filter (where breach_level is not null or bonus_code ilike '%breach%')::int as breach_leads
      from investors where deleted_at is null
    `),
    db.execute(sql`
      select
        coalesce(sum(amount) filter (where status <> 'cancelled'), 0) as collecte,
        count(*) filter (where status <> 'cancelled')::int as subs,
        count(distinct investor_id) filter (where status <> 'cancelled')::int as investors,
        coalesce(sum(amount) filter (where status <> 'cancelled' and signed_at >= date_trunc('month', now())), 0) as collecte_month
      from subscriptions
    `),
    db.execute(sql`
      select coalesce(sum(s.amount) filter (where s.status <> 'cancelled'), 0) as breach_collecte
      from subscriptions s join investors i on i.id = s.investor_id
      where (i.breach_level is not null or i.bonus_code ilike '%breach%')
    `),
    db.execute(sql`
      select count(*)::int as total,
        count(*) filter (where status in ('open', 'funding'))::int as open
      from projects
    `),
    db.execute(sql`
      select p.id::text as id, p.name,
        coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected,
        count(distinct s.investor_id) filter (where s.status <> 'cancelled')::int as investors
      from projects p left join subscriptions s on s.project_id = p.id
      group by p.id, p.name order by collected desc limit 6
    `),
    db.execute(sql`
      select to_char(date_trunc('month', signed_at), 'YYYY-MM') as month,
        coalesce(sum(amount), 0) as collected
      from subscriptions
      where status <> 'cancelled' and signed_at is not null
      group by month order by month desc limit 12
    `),
    // Nouveaux inscrits : période courante vs précédente
    db.execute(sql`
      select
        count(*) filter (where sah_created_at >= ${fromISO}::timestamptz and sah_created_at < ${toISO}::timestamptz)::int as cur,
        count(*) filter (where sah_created_at >= ${prevFromISO}::timestamptz and sah_created_at < ${prevToISO}::timestamptz)::int as prev
      from investors where deleted_at is null and sah_created_at is not null
    `),
    // Collecte / souscriptions / investisseurs : période courante vs précédente (date de signature)
    db.execute(sql`
      select
        coalesce(sum(amount) filter (where signed_at >= ${fromISO}::timestamptz and signed_at < ${toISO}::timestamptz), 0) as cur_collecte,
        coalesce(sum(amount) filter (where signed_at >= ${prevFromISO}::timestamptz and signed_at < ${prevToISO}::timestamptz), 0) as prev_collecte,
        count(*) filter (where signed_at >= ${fromISO}::timestamptz and signed_at < ${toISO}::timestamptz)::int as cur_subs,
        count(*) filter (where signed_at >= ${prevFromISO}::timestamptz and signed_at < ${prevToISO}::timestamptz)::int as prev_subs,
        count(distinct investor_id) filter (where signed_at >= ${fromISO}::timestamptz and signed_at < ${toISO}::timestamptz)::int as cur_inv,
        count(distinct investor_id) filter (where signed_at >= ${prevFromISO}::timestamptz and signed_at < ${prevToISO}::timestamptz)::int as prev_inv
      from subscriptions where status <> 'cancelled' and signed_at is not null
    `),
  ]);

  const inv = (invR as unknown as Row[])[0] ?? {};
  const sub = (subR as unknown as Row[])[0] ?? {};
  const breach = (breachR as unknown as Row[])[0] ?? {};
  const proj = (projR as unknown as Row[])[0] ?? {};
  const n = (v: string | number | null | undefined) => Number(v) || 0;

  const collecteTotal = n(sub.collecte);
  const subInvestors = n(sub.investors);

  return {
    investors: {
      total: n(inv.total),
      registered: n(inv.registered),
      onboarded: n(inv.onboarded),
      newMonth: n(inv.new_month),
      new7d: n(inv.new7d),
    },
    breachLeads: n(inv.breach_leads),
    collecte: {
      total: collecteTotal,
      subs: n(sub.subs),
      investors: subInvestors,
      month: n(sub.collecte_month),
      avgTicket: subInvestors > 0 ? Math.round(collecteTotal / subInvestors) : 0,
    },
    breachCollecte: n(breach.breach_collecte),
    projects: { total: n(proj.total), open: n(proj.open) },
    topProjects: (topR as unknown as Row[]).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? '—'),
      collected: n(r.collected),
      investors: n(r.investors),
    })),
    byMonth: (monthR as unknown as Row[])
      .map((r) => ({ month: String(r.month), collected: n(r.collected) }))
      .reverse(),
    period: (() => {
      const lp = (leadsPR as unknown as Row[])[0] ?? {};
      const spv = (subsPR as unknown as Row[])[0] ?? {};
      return {
        label: period.label,
        leads: delta(n(lp.cur), n(lp.prev)),
        collecte: delta(Math.round(n(spv.cur_collecte)), Math.round(n(spv.prev_collecte))),
        subs: delta(n(spv.cur_subs), n(spv.prev_subs)),
        investors: delta(n(spv.cur_inv), n(spv.prev_inv)),
      };
    })(),
  };
}
