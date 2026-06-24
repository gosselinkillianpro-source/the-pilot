import { eq, sql } from 'drizzle-orm';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getInvestorScored } from './call-queue';
import { getCallImpact, getInvestorTimeline } from './closing';
import { getInvestorById, getInvestorSubscriptions } from './investors';

/**
 * Requêtes de l'espace "admin affilié" — TOUJOURS scopées au sous-réseau de la
 * personne SAH (owner_sah_id via affiliate_network). Aucune de ces requêtes ne doit
 * renvoyer de données hors de ce réseau (isolation = défense en profondeur, voir
 * aussi le layout (dashboard) qui bloque l'accès aux pages staff).
 */

/** sah_id de la personne SAH représentée par ce compte THE PILOT (null = staff interne). */
export async function getAffiliateSahId(userId: string): Promise<string | null> {
  const r = await db
    .select({ sahUserId: users.sahUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return r[0]?.sahUserId ?? null;
}

/**
 * Résout le périmètre de l'affilié courant (user authentifié → son sah_id).
 * Renvoie null si le compte n'est lié à aucun réseau (staff interne ou non configuré)
 * → les pages affichent alors l'état « compte non relié », sans requête de données.
 */
export async function resolveAffiliateScope(): Promise<{ userId: string; sahId: string } | null> {
  const user = await getAuthenticatedUser();
  const sahId = await getAffiliateSahId(user.id);
  return sahId ? { userId: user.id, sahId } : null;
}

export type AffiliateLevel = {
  depth: number; // 1 = filleul direct (N+1), 2 = N+2…
  label: string;
  members: number;
  onboarded: number;
  invested: number;
};

export type AffiliateStats = {
  totalMembers: number;
  registered: number; // ont complété leur profil
  onboarded: number; // KYC validé
  investors: number; // au moins une souscription non annulée
  totalInvested: number;
  subCount: number;
  avgTicketPerInvestor: number;
  avgPerSub: number;
  new30d: number; // inscrits dans les 30 derniers jours
  walletAvailable: number; // € cumulés dans les wallets du réseau (argent à placer)
  byLevel: AffiliateLevel[];
  topProjects: { name: string; investors: number; collected: number }[];
};

/** Vue d'ensemble complète du réseau d'un affilié (toutes les stats). */
export async function getAffiliateStats(ownerSahId: string): Promise<AffiliateStats> {
  const funnel = (await db.execute(sql`
    select
      count(distinct i.id)::int as total,
      count(distinct i.id) filter (where i.registration_complete)::int as registered,
      count(distinct i.id) filter (where i.onboarding_complete)::int as onboarded,
      count(distinct i.id) filter (where i.sah_created_at >= now() - interval '30 days')::int as new30d,
      coalesce(sum(i.wallet_balance_cents), 0) as wallet_cents
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    where an.owner_sah_id = ${ownerSahId}
  `)) as unknown as {
    total: number;
    registered: number;
    onboarded: number;
    new30d: number;
    wallet_cents: string | number;
  }[];

  const invested = (await db.execute(sql`
    select
      count(distinct s.investor_id)::int as investors,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      count(s.id) filter (where s.status <> 'cancelled')::int as sub_count
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    join subscriptions s on s.investor_id = i.id
    where an.owner_sah_id = ${ownerSahId}
  `)) as unknown as {
    investors: number;
    total_invested: string | number;
    sub_count: number;
  }[];

  const levels = (await db.execute(sql`
    select
      an.depth::int as depth,
      count(distinct i.id)::int as members,
      count(distinct i.id) filter (where i.onboarding_complete)::int as onboarded,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as invested
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    left join subscriptions s on s.investor_id = i.id
    where an.owner_sah_id = ${ownerSahId}
    group by an.depth
    order by an.depth
  `)) as unknown as {
    depth: number;
    members: number;
    onboarded: number;
    invested: string | number;
  }[];

  const projects = (await db.execute(sql`
    select
      p.name,
      count(distinct i.id)::int as investors,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    join subscriptions s on s.investor_id = i.id
    join projects p on p.id = s.project_id
    where an.owner_sah_id = ${ownerSahId} and s.status <> 'cancelled'
    group by p.name
    order by collected desc
    limit 8
  `)) as unknown as { name: string | null; investors: number; collected: string | number }[];

  const f = funnel[0] ?? { total: 0, registered: 0, onboarded: 0, new30d: 0, wallet_cents: 0 };
  const inv = invested[0] ?? { investors: 0, total_invested: 0, sub_count: 0 };
  const totalInvested = Number(inv.total_invested) || 0;
  const investors = Number(inv.investors) || 0;
  const subCount = Number(inv.sub_count) || 0;

  return {
    totalMembers: Number(f.total),
    registered: Number(f.registered),
    onboarded: Number(f.onboarded),
    investors,
    totalInvested,
    subCount,
    avgTicketPerInvestor: investors > 0 ? Math.round(totalInvested / investors) : 0,
    avgPerSub: subCount > 0 ? Math.round(totalInvested / subCount) : 0,
    new30d: Number(f.new30d),
    walletAvailable: Math.round((Number(f.wallet_cents) || 0) / 100),
    byLevel: levels.map((l) => ({
      depth: Number(l.depth),
      label: `N+${Number(l.depth)}`,
      members: Number(l.members),
      onboarded: Number(l.onboarded),
      invested: Number(l.invested) || 0,
    })),
    topProjects: projects.map((p) => ({
      name: p.name ?? '—',
      investors: Number(p.investors),
      collected: Number(p.collected) || 0,
    })),
  };
}

export type AffiliateMember = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  depth: number;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  pipelineStage: string;
  invested: number;
  walletBalanceCents: number | null;
  lastActivityAt: string | null;
};

/** Liste de tous les membres du réseau (avec niveau, statut, collecte). */
export async function getAffiliateMembers(ownerSahId: string): Promise<AffiliateMember[]> {
  // Sous-requêtes scalaires (pas de double left join) : sinon le produit cartésien
  // souscriptions × interactions gonflerait le montant investi.
  const rows = (await db.execute(sql`
    select
      i.id::text as id, i.full_name, i.email, i.phone, i.address_city as city,
      an.depth::int as depth, i.registration_complete, i.onboarding_complete, i.pipeline_stage,
      i.wallet_balance_cents,
      coalesce((
        select sum(s.amount) from subscriptions s
        where s.investor_id = i.id and s.status <> 'cancelled'
      ), 0) as invested,
      (select max(x.created_at) from interactions x where x.investor_id = i.id)::text as last_activity_at
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    where an.owner_sah_id = ${ownerSahId}
    order by invested desc, i.sah_created_at desc nulls last
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    fullName: (r.full_name as string | null) ?? null,
    email: String(r.email ?? ''),
    phone: (r.phone as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    depth: Number(r.depth),
    registrationComplete: Boolean(r.registration_complete),
    onboardingComplete: Boolean(r.onboarding_complete),
    pipelineStage: String(r.pipeline_stage ?? 'new'),
    invested: Number(r.invested) || 0,
    walletBalanceCents: r.wallet_balance_cents != null ? Number(r.wallet_balance_cents) : null,
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
  }));
}

export type AffiliateSubscription = {
  id: string;
  investorId: string;
  investorName: string | null;
  projectName: string | null;
  amount: number;
  status: string;
  date: string | null;
};

/** Souscriptions du réseau (les plus récentes d'abord). */
export async function getAffiliateSubscriptions(
  ownerSahId: string,
): Promise<AffiliateSubscription[]> {
  const rows = (await db.execute(sql`
    select
      s.id::text as id, s.amount, s.status,
      coalesce(s.signed_at, s.created_at)::text as date,
      i.id::text as investor_id, i.full_name as investor_name,
      p.name as project_name
    from affiliate_network an
    join investors i on i.id = an.investor_id and i.deleted_at is null
    join subscriptions s on s.investor_id = i.id
    left join projects p on p.id = s.project_id
    where an.owner_sah_id = ${ownerSahId}
    order by coalesce(s.signed_at, s.created_at) desc nulls last
    limit 300
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    investorId: String(r.investor_id),
    investorName: (r.investor_name as string | null) ?? null,
    projectName: (r.project_name as string | null) ?? null,
    amount: Number(r.amount) || 0,
    status: String(r.status ?? ''),
    date: (r.date as string | null) ?? null,
  }));
}

export type AffiliateInvestorDetail = {
  investor: NonNullable<Awaited<ReturnType<typeof getInvestorById>>>;
  depth: number | null;
  scored: Awaited<ReturnType<typeof getInvestorScored>>;
  subs: Awaited<ReturnType<typeof getInvestorSubscriptions>>;
  timeline: Awaited<ReturnType<typeof getInvestorTimeline>>;
  callImpact: Awaited<ReturnType<typeof getCallImpact>>;
};

/**
 * Fiche complète d'un investisseur — IDENTIQUE à la fiche staff (réutilise les MÊMES
 * requêtes : investor, souscriptions, scoring, historique, impact appel), mais
 * accessible UNIQUEMENT si l'investisseur appartient au réseau de l'affilié.
 * CONTRÔLE D'APPARTENANCE OBLIGATOIRE avant toute lecture : hors réseau → null (404).
 */
export async function getAffiliateInvestorDetail(
  investorId: string,
  ownerSahId: string,
): Promise<AffiliateInvestorDetail | null> {
  const investor = await getInvestorById(investorId); // valide aussi le format d'id
  if (!investor) return null;

  const owns = (await db.execute(sql`
    select depth::int as depth from affiliate_network
    where owner_sah_id = ${ownerSahId} and investor_id = ${investor.id} limit 1
  `)) as unknown as { depth: number }[];
  if (owns.length === 0) return null; // hors réseau → pas d'accès

  const [subs, scored, timeline, callImpact] = await Promise.all([
    getInvestorSubscriptions(investor.id),
    getInvestorScored(investor.id),
    getInvestorTimeline(investor.id),
    getCallImpact(investor.id),
  ]);

  return { investor, depth: owns[0]?.depth ?? null, scored, subs, timeline, callImpact };
}
