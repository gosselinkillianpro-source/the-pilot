import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Les clients CGP d'un closer lui reviennent d'office.
 *
 * Décision Killian (7 sept. 2026) : Dimitri, Alexandre et Yannick sont CGP chez
 * Seven At Home avant d'être closers ici. Les personnes inscrites avec LEUR code
 * bonus (investors.parent_sah_id = leur sah_id, posé sur users.sah_user_id) sont
 * leurs clients : quand ils ouvrent « Mes clients », ils doivent déjà les voir.
 *
 * Règle : on n'attribue que les personnes LIBRES — on ne retire jamais un
 * client à un collègue qui le suit déjà. Rejoué à chaque synchro SAH, donc un
 * nouvel inscrit avec le code d'un closer lui arrive dans le quart d'heure.
 */

export type CgpAssignment = { closerId: string; closerName: string | null; assigned: number };

export async function assignCgpClients(opts?: { userId?: string }): Promise<CgpAssignment[]> {
  const userFilter = opts?.userId ? sql`and u.id = ${opts.userId}` : sql``;
  const rows = (await db.execute(sql`
    with target as (
      select u.id, u.full_name, u.sah_user_id
      from users u
      where u.sah_user_id is not null and u.sah_user_id <> ''
        and u.active
        and u.role in ('closer', 'closer_junior')
        ${userFilter}
    ),
    moved as (
      update investors i
        set assigned_closer_id = t.id,
            assigned_at = now(),
            assignment_source = 'cgp',
            updated_at = now()
      from target t
      where i.parent_sah_id = t.sah_user_id
        and i.assigned_closer_id is null
        and i.deleted_at is null
      returning t.id as closer_id, t.full_name as closer_name
    )
    select closer_id::text as closer_id, closer_name, count(*)::int as assigned
    from moved
    group by closer_id, closer_name
  `)) as unknown as { closer_id: string; closer_name: string | null; assigned: number }[];
  return rows.map((r) => ({
    closerId: r.closer_id,
    closerName: r.closer_name,
    assigned: Number(r.assigned) || 0,
  }));
}

/** Combien de personnes portent le code de ce sah_id (attribuées ou non) — pour l'admin. */
export async function countCgpClients(sahUserId: string): Promise<{ total: number; free: number }> {
  const rows = (await db.execute(sql`
    select count(*)::int as total,
           count(*) filter (where assigned_closer_id is null)::int as free
    from investors
    where deleted_at is null and parent_sah_id = ${sahUserId}
  `)) as unknown as { total: number; free: number }[];
  const r = rows[0];
  return { total: Number(r?.total) || 0, free: Number(r?.free) || 0 };
}
