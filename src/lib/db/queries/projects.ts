import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectListItem = {
  id: string;
  name: string;
  status: string;
  city: string | null;
  targetAmount: number | null;
  targetYield: number | null;
  durationMonths: number | null;
  openedAt: Date | null;
  expectedCompletionAt: Date | null;
  collected: number;
  investors: number;
  subs: number;
};

type RawProject = {
  id: string;
  name: string;
  status: string;
  location_city: string | null;
  target_amount: string | number | null;
  target_yield_annual: string | number | null;
  duration_months: number | null;
  opened_at: string | Date | null;
  expected_completion_at: string | Date | null;
  collected: string | number;
  investors: number;
  subs: number;
};

function mapRow(r: RawProject): ProjectListItem {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    city: r.location_city,
    targetAmount: r.target_amount != null ? Number(r.target_amount) : null,
    targetYield: r.target_yield_annual != null ? Number(r.target_yield_annual) : null,
    durationMonths: r.duration_months,
    openedAt: r.opened_at ? new Date(r.opened_at) : null,
    expectedCompletionAt: r.expected_completion_at ? new Date(r.expected_completion_at) : null,
    collected: Number(r.collected) || 0,
    investors: Number(r.investors) || 0,
    subs: Number(r.subs) || 0,
  };
}

/** Tous les projets avec financement collecté + nb d'investisseurs. */
export async function listProjectsWithStats(): Promise<ProjectListItem[]> {
  const rows = (await db.execute(sql`
    select
      p.id::text as id, p.name, p.status, p.location_city,
      p.target_amount, p.target_yield_annual, p.duration_months,
      p.opened_at, p.expected_completion_at,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected,
      count(distinct s.investor_id) filter (where s.status <> 'cancelled')::int as investors,
      count(s.id) filter (where s.status <> 'cancelled')::int as subs
    from projects p
    left join subscriptions s on s.project_id = p.id
    group by p.id
    order by p.opened_at desc nulls last, p.created_at desc
  `)) as unknown as RawProject[];
  return rows.map(mapRow);
}

export type ProjectDetail = ProjectListItem & {
  region: string | null;
  projectType: string | null;
  descriptionShort: string | null;
  descriptionLong: string | null;
  createdAt: Date | null;
  repaymentDate: Date | null;
};

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = (await db.execute(sql`
    select
      p.id::text as id, p.name, p.status, p.location_city,
      p.target_amount, p.target_yield_annual, p.duration_months,
      p.opened_at, p.expected_completion_at,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected,
      count(distinct s.investor_id) filter (where s.status <> 'cancelled')::int as investors,
      count(s.id) filter (where s.status <> 'cancelled')::int as subs
    from projects p
    left join subscriptions s on s.project_id = p.id
    where p.id = ${id}
    group by p.id
  `)) as unknown as RawProject[];
  const r = rows[0];
  if (!r) return null;

  const meta = await db
    .select({
      region: projects.locationRegion,
      projectType: projects.projectType,
      descriptionShort: projects.descriptionShort,
      descriptionLong: projects.descriptionLong,
      createdAt: projects.createdAt,
      repaymentDate: projects.repaymentDate,
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  const m = meta[0];

  return {
    ...mapRow(r),
    region: m?.region ?? null,
    projectType: m?.projectType ?? null,
    descriptionShort: m?.descriptionShort ?? null,
    descriptionLong: m?.descriptionLong ?? null,
    createdAt: m?.createdAt ?? null,
    repaymentDate: m?.repaymentDate ?? null,
  };
}

export type ProjectInvestor = {
  investorId: string;
  fullName: string | null;
  email: string;
  amount: number;
  sharesCount: number | null;
  status: string;
  signedAt: Date | null;
  isBreach: boolean;
};

/** Liste des investisseurs d'un projet (montant investi par chacun). */
export async function getProjectInvestors(id: string): Promise<ProjectInvestor[]> {
  if (!UUID_RE.test(id)) return [];
  const rows = (await db.execute(sql`
    select
      i.id::text as investor_id, i.full_name, i.email, i.bonus_code,
      s.amount, s.shares_count, s.status, s.signed_at
    from subscriptions s
    join investors i on i.id = s.investor_id
    where s.project_id = ${id}
    order by s.amount desc nulls last, s.signed_at desc
  `)) as unknown as {
    investor_id: string;
    full_name: string | null;
    email: string;
    bonus_code: string | null;
    amount: string | number | null;
    shares_count: number | null;
    status: string;
    signed_at: string | Date | null;
  }[];

  return rows.map((r) => ({
    investorId: r.investor_id,
    fullName: r.full_name,
    email: r.email,
    amount: r.amount != null ? Number(r.amount) : 0,
    sharesCount: r.shares_count,
    status: r.status,
    signedAt: r.signed_at ? new Date(r.signed_at) : null,
    isBreach: r.bonus_code != null && /breach/i.test(r.bonus_code),
  }));
}
