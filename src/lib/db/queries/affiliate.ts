import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

/**
 * Requêtes de l'espace "admin affilié" — TOUJOURS scopées au sous-réseau de la
 * personne SAH (owner_sah_id). Aucune de ces requêtes ne doit renvoyer de données
 * hors de ce réseau (isolation = défense en profondeur, voir aussi le layout).
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

export type AffiliateLevel = {
  depth: number; // 1 = filleul direct (N+1), 2 = N+2…
  label: string;
  members: number;
  onboarded: number;
  invested: number;
};

export type AffiliateOverview = {
  totalMembers: number;
  totalOnboarded: number;
  totalInvested: number;
  byLevel: AffiliateLevel[];
};

type LevelRow = {
  depth: number;
  members: number;
  onboarded: number;
  invested: string | number;
};

/** Vue d'ensemble du réseau d'un affilié : effectifs, onboardés et collecte par niveau. */
export async function getAffiliateOverview(ownerSahId: string): Promise<AffiliateOverview> {
  const rows = (await db.execute(sql`
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
  `)) as unknown as LevelRow[];

  const byLevel: AffiliateLevel[] = rows.map((r) => ({
    depth: Number(r.depth),
    label: `N+${Number(r.depth)}`,
    members: Number(r.members),
    onboarded: Number(r.onboarded),
    invested: Number(r.invested) || 0,
  }));

  return {
    totalMembers: byLevel.reduce((s, l) => s + l.members, 0),
    totalOnboarded: byLevel.reduce((s, l) => s + l.onboarded, 0),
    totalInvested: byLevel.reduce((s, l) => s + l.invested, 0),
    byLevel,
  };
}
