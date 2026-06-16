'use server';

import { sql } from 'drizzle-orm';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Recherche d'un lead par n'importe quelle info (nom, prénom, email, téléphone, ville).
 * Lecture seule, réservée aux utilisateurs authentifiés. Renvoie au plus 8 résultats.
 * Le téléphone est aussi comparé en chiffres-seuls (insensible aux espaces/formats).
 */
export async function searchLeadsAction(query: string) {
  await getAuthenticatedUser(); // exige une session
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, '');
  // Téléphone : compare en chiffres-seuls (insensible aux espaces/formats). Pour un numéro
  // quasi complet, on compare les 9 derniers chiffres → gère « 06… » ↔ « +336… ».
  let phoneFrag = sql``;
  if (digits.length >= 3) {
    const normPhone = sql`regexp_replace(coalesce(i.phone, ''), '\\D', '', 'g')`;
    phoneFrag =
      digits.length >= 6
        ? sql`or right(${normPhone}, 9) = ${digits.slice(-9)} or ${normPhone} ilike ${`%${digits}%`}`
        : sql`or ${normPhone} ilike ${`%${digits}%`}`;
  }

  const rows = await db.execute(sql`
    select i.id::text as id, i.full_name, i.email, i.phone, i.address_city as city
    from investors i
    where i.deleted_at is null
      and (
        i.full_name ilike ${like}
        or i.first_name ilike ${like}
        or i.last_name ilike ${like}
        or i.email ilike ${like}
        or i.phone ilike ${like}
        ${phoneFrag}
      )
    order by case when i.full_name ilike ${like} then 0 else 1 end, i.full_name asc nulls last
    limit 8
  `);

  return (rows as unknown as Array<Record<string, string | null>>).map((r) => ({
    id: String(r.id),
    fullName: r.full_name ?? null,
    email: String(r.email ?? ''),
    phone: r.phone ?? null,
    city: r.city ?? null,
  }));
}
