import 'server-only';

import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { RDV_ADS_ELIGIBLE_SQL } from '@/lib/db/queries/ads-acquisition';
import { adAttributions, investors, subscriptions, users } from '@/lib/db/schema';

/**
 * Attributions pub manuelles : les personnes qu'on rattache À LA MAIN aux ads
 * BREACH (ou à une campagne précise), quand aucun signal automatique (code
 * bonus, RDV Calendly) ne les capte. Voir getRdvManualCounts pour l'agrégation.
 */

export type AdAttributionRow = {
  id: string;
  investorId: string;
  fullName: string | null;
  email: string;
  label: string;
  platform: string | null;
  createdByName: string | null;
  createdAt: Date;
  invested: number; // € souscrits (non annulés), toutes périodes
};

export async function listAdAttributions(): Promise<AdAttributionRow[]> {
  const rows = await db
    .select({
      id: adAttributions.id,
      investorId: adAttributions.investorId,
      fullName: investors.fullName,
      email: investors.email,
      label: adAttributions.label,
      platform: adAttributions.platform,
      createdByName: users.fullName,
      createdAt: adAttributions.createdAt,
      invested: sql<string>`coalesce((
        select sum(${subscriptions.amount}) from ${subscriptions}
        where ${subscriptions.investorId} = ${adAttributions.investorId}
          and ${subscriptions.status} <> 'cancelled'
      ), 0)`,
    })
    .from(adAttributions)
    .innerJoin(investors, eq(investors.id, adAttributions.investorId))
    .leftJoin(users, eq(users.id, adAttributions.createdBy))
    .orderBy(desc(adAttributions.createdAt));

  return rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
    invested: Number(r.invested) || 0,
  }));
}

export type TrackCandidate = {
  investorId: string;
  fullName: string | null;
  email: string;
  bonusCode: string | null;
  alreadyTracked: boolean; // a déjà une attribution manuelle
};

/** Recherche une fiche par nom ou email pour l'ajouter au tracking (8 max). */
export async function searchTrackCandidates(query: string): Promise<TrackCandidate[]> {
  const q = `%${query.trim()}%`;
  const rows = await db
    .select({
      investorId: investors.id,
      fullName: investors.fullName,
      email: investors.email,
      bonusCode: investors.bonusCode,
      attributionId: adAttributions.id,
    })
    .from(investors)
    .leftJoin(adAttributions, eq(adAttributions.investorId, investors.id))
    .where(
      and(isNull(investors.deletedAt), or(ilike(investors.fullName, q), ilike(investors.email, q))),
    )
    .orderBy(desc(investors.sahCreatedAt))
    .limit(8);

  return rows.map((r) => ({
    investorId: r.investorId,
    fullName: r.fullName,
    email: r.email,
    bonusCode: r.bonusCode,
    alreadyTracked: r.attributionId !== null,
  }));
}

/** Ajoute une attribution (une seule par personne). Retourne false si déjà présente. */
export async function insertAdAttribution(input: {
  investorId: string;
  label: string;
  platform: 'Meta' | 'Google' | null;
  createdBy: string;
}): Promise<boolean> {
  const inserted = await db
    .insert(adAttributions)
    .values({
      investorId: input.investorId,
      label: input.label,
      platform: input.platform,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing()
    .returning({ id: adAttributions.id });
  return inserted.length > 0;
}

/** Retire une attribution. Retourne l'investor_id retiré, ou null si inconnue. */
export async function deleteAdAttribution(id: string): Promise<string | null> {
  const deleted = await db
    .delete(adAttributions)
    .where(eq(adAttributions.id, id))
    .returning({ investorId: adAttributions.investorId });
  return deleted[0]?.investorId ?? null;
}

/**
 * Nombre de personnes attribuées AUTOMATIQUEMENT via un RDV Calendly (toutes
 * périodes) — pour afficher l'ampleur de la règle auto à côté de la liste manuelle.
 * Même règle d'éligibilité que le bucket agrégé (RDV_ADS_ELIGIBLE_SQL).
 */
export async function countRdvAutoTracked(): Promise<number> {
  const res = await db.execute(sql`
    select count(*)::int as c
    from investors i
    where i.deleted_at is null
      and exists (
        select 1 from rdv_contacts rc
        where rc.investor_id = i.id and rc.source = 'calendly'
      )
      and ${sql.raw(RDV_ADS_ELIGIBLE_SQL)}
      and not exists (select 1 from ad_attributions a where a.investor_id = i.id)
  `);
  const row = (res as unknown as { c: number | string | null }[])[0];
  return Number(row?.c) || 0;
}
