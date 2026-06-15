import 'server-only';
import { sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/ads/period';
import { db } from '@/lib/db';

/**
 * Comptages SAH réels pour croiser avec la dépense pub.
 *
 * Logique « par période » (flux) : on compte ce qui se passe DANS la fenêtre.
 * - inscrits / complets : par date de création du compte (sah_created_at).
 * - investisseurs / collecte : par date de signature de la souscription (signed_at).
 *
 * « complets » = profil renseigné ET KYC validé (registration_complete && onboarding_complete),
 * càd ce que Killian appelle « complètement inscrit (KYC + profil complet) ».
 *
 * Aucune attribution requise : on croise des AGRÉGATS de période, pas des individus.
 * Lecture seule. Aucune donnée personnelle exposée.
 */
export type AcquisitionCounts = {
  inscrits: number; // comptes créés dans la fenêtre
  complets: number; // créés dans la fenêtre + profil & KYC OK aujourd'hui
  investisseurs: number; // ont signé une souscription dans la fenêtre
  collecte: number; // € signés dans la fenêtre (non annulés)
};

type Row = Record<string, string | number | null>;
const n = (v: string | number | null | undefined) => Number(v) || 0;

/**
 * Renvoie les comptages pour la période courante ET la précédente (pour les deltas).
 * Bornes : [since 00:00 ; until+1j 00:00[ — `until` est inclusif (jour entier).
 */
export async function getAcquisitionCounts(
  cur: DateRange,
  prev: DateRange,
): Promise<{ current: AcquisitionCounts; previous: AcquisitionCounts }> {
  const [invR, subR] = await Promise.all([
    db.execute(sql`
      select
        count(*) filter (
          where sah_created_at >= ${cur.since}::date
            and sah_created_at < (${cur.until}::date + interval '1 day')
        )::int as cur_inscrits,
        count(*) filter (
          where sah_created_at >= ${cur.since}::date
            and sah_created_at < (${cur.until}::date + interval '1 day')
            and registration_complete and onboarding_complete
        )::int as cur_complets,
        count(*) filter (
          where sah_created_at >= ${prev.since}::date
            and sah_created_at < (${prev.until}::date + interval '1 day')
        )::int as prev_inscrits,
        count(*) filter (
          where sah_created_at >= ${prev.since}::date
            and sah_created_at < (${prev.until}::date + interval '1 day')
            and registration_complete and onboarding_complete
        )::int as prev_complets
      from investors
      where deleted_at is null and sah_created_at is not null
    `),
    db.execute(sql`
      select
        count(distinct investor_id) filter (
          where signed_at >= ${cur.since}::date
            and signed_at < (${cur.until}::date + interval '1 day')
            and status <> 'cancelled'
        )::int as cur_investisseurs,
        coalesce(sum(amount) filter (
          where signed_at >= ${cur.since}::date
            and signed_at < (${cur.until}::date + interval '1 day')
            and status <> 'cancelled'
        ), 0) as cur_collecte,
        count(distinct investor_id) filter (
          where signed_at >= ${prev.since}::date
            and signed_at < (${prev.until}::date + interval '1 day')
            and status <> 'cancelled'
        )::int as prev_investisseurs,
        coalesce(sum(amount) filter (
          where signed_at >= ${prev.since}::date
            and signed_at < (${prev.until}::date + interval '1 day')
            and status <> 'cancelled'
        ), 0) as prev_collecte
      from subscriptions
      where signed_at is not null
    `),
  ]);

  const inv = (invR as unknown as Row[])[0] ?? {};
  const sub = (subR as unknown as Row[])[0] ?? {};

  return {
    current: {
      inscrits: n(inv.cur_inscrits),
      complets: n(inv.cur_complets),
      investisseurs: n(sub.cur_investisseurs),
      collecte: n(sub.cur_collecte),
    },
    previous: {
      inscrits: n(inv.prev_inscrits),
      complets: n(inv.prev_complets),
      investisseurs: n(sub.prev_investisseurs),
      collecte: n(sub.prev_collecte),
    },
  };
}
