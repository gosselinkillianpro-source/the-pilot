import 'server-only';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors, projects, subscriptions } from '@/lib/db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InvestorListItem = {
  id: string;
  email: string;
  fullName: string | null;
  addressCity: string | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  score: number | null;
};

export async function listInvestors(opts: {
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<{ rows: InvestorListItem[]; total: number }> {
  const { search, offset = 0, limit = 50 } = opts;
  const filters = [isNull(investors.deletedAt)];
  const term = search?.trim();
  if (term) {
    const s = `%${term}%`;
    const m = or(ilike(investors.fullName, s), ilike(investors.email, s));
    if (m) filters.push(m);
  }
  const where = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: investors.id,
        email: investors.email,
        fullName: investors.fullName,
        addressCity: investors.addressCity,
        registrationComplete: investors.registrationComplete,
        onboardingComplete: investors.onboardingComplete,
        score: investors.score,
      })
      .from(investors)
      .where(where)
      .orderBy(desc(investors.onboardingComplete), desc(investors.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(investors).where(where),
  ]);

  return { rows, total: totalRow[0]?.n ?? 0 };
}

export async function getInvestorStats(): Promise<{
  total: number;
  registered: number;
  onboarded: number;
}> {
  const r = await db
    .select({
      total: sql<number>`count(*)::int`,
      registered: sql<number>`count(*) filter (where ${investors.registrationComplete})::int`,
      onboarded: sql<number>`count(*) filter (where ${investors.onboardingComplete})::int`,
    })
    .from(investors)
    .where(isNull(investors.deletedAt));
  return r[0] ?? { total: 0, registered: 0, onboarded: 0 };
}

export type InvestorRow = typeof investors.$inferSelect;

export async function getInvestorById(id: string): Promise<InvestorRow | null> {
  if (!UUID_RE.test(id)) return null; // évite une erreur SQL sur un id non-uuid
  const r = await db.select().from(investors).where(eq(investors.id, id)).limit(1);
  return r[0] ?? null;
}

export type InvestorSubscription = {
  id: string;
  projectName: string;
  projectCity: string | null;
  amount: string;
  sharesCount: number | null;
  status: string;
  signedAt: Date | null;
  paidAt: Date | null;
};

/** Souscriptions d'un investisseur (avec le projet), les plus récentes d'abord. */
export async function getInvestorSubscriptions(investorId: string): Promise<{
  rows: InvestorSubscription[];
  totalAmount: number;
  activeCount: number;
}> {
  if (!UUID_RE.test(investorId)) return { rows: [], totalAmount: 0, activeCount: 0 };
  const rows = await db
    .select({
      id: subscriptions.id,
      projectName: projects.name,
      projectCity: projects.locationCity,
      amount: subscriptions.amount,
      sharesCount: subscriptions.sharesCount,
      status: subscriptions.status,
      signedAt: subscriptions.signedAt,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .innerJoin(projects, eq(subscriptions.projectId, projects.id))
    .where(eq(subscriptions.investorId, investorId))
    .orderBy(desc(subscriptions.signedAt), desc(subscriptions.paidAt));

  // Total investi = souscriptions non annulées.
  let totalAmount = 0;
  let activeCount = 0;
  for (const r of rows) {
    if (r.status !== 'cancelled') {
      totalAmount += Number(r.amount) || 0;
      activeCount += 1;
    }
  }
  return { rows, totalAmount, activeCount };
}

export type InvestableProject = {
  name: string;
  city: string | null;
  targetYieldAnnual: string | null;
  durationMonths: number | null;
  status: string;
};

/** Projets ouverts à la souscription (pour les propositions d'email IA). */
export async function getInvestableProjects(): Promise<InvestableProject[]> {
  const rows = await db
    .select({
      name: projects.name,
      city: projects.locationCity,
      targetYieldAnnual: projects.targetYieldAnnual,
      durationMonths: projects.durationMonths,
      status: projects.status,
    })
    .from(projects)
    .where(inArray(projects.status, ['open', 'funding']))
    .limit(12);
  return rows;
}
