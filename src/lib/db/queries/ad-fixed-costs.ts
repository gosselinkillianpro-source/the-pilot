import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/ads/period';
import { db } from '@/lib/db';
import { adFixedCosts, users } from '@/lib/db/schema';

/**
 * Coûts fixes marketing (outils, créa, prestataires), saisis à la main par mois.
 * Ils ne touchent JAMAIS le ROAS média : ils servent uniquement au second
 * indicateur « ROI complet », affiché séparément sur la console Ads.
 */

export type FixedCostRow = {
  id: string;
  month: string; // 'YYYY-MM'
  label: string;
  amountEur: number;
  createdByName: string | null;
};

export async function listFixedCosts(limit = 60): Promise<FixedCostRow[]> {
  const rows = await db
    .select({
      id: adFixedCosts.id,
      month: adFixedCosts.month,
      label: adFixedCosts.label,
      amountEur: adFixedCosts.amountEur,
      createdByName: users.fullName,
    })
    .from(adFixedCosts)
    .leftJoin(users, eq(users.id, adFixedCosts.createdBy))
    .orderBy(desc(adFixedCosts.month), desc(adFixedCosts.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, amountEur: Number(r.amountEur) || 0 }));
}

/**
 * Somme des coûts fixes des MOIS CALENDAIRES couverts par la plage (un mois
 * entamé compte en entier — approximation assumée, affichée dans la définition).
 */
export async function sumFixedCostsForRange(range: DateRange): Promise<number> {
  const fromMonth = range.since.slice(0, 7);
  const toMonth = range.until.slice(0, 7);
  const res = await db.execute(sql`
    select coalesce(sum(amount_eur), 0) as total
    from ad_fixed_costs
    where month >= ${fromMonth} and month <= ${toMonth}
  `);
  const row = (res as unknown as { total: string | number | null }[])[0];
  return Number(row?.total) || 0;
}

export async function insertFixedCost(input: {
  month: string;
  label: string;
  amountEur: number;
  createdBy: string;
}): Promise<void> {
  await db.insert(adFixedCosts).values({
    month: input.month,
    label: input.label,
    amountEur: input.amountEur.toFixed(2),
    createdBy: input.createdBy,
  });
}

export async function deleteFixedCost(id: string): Promise<boolean> {
  const deleted = await db
    .delete(adFixedCosts)
    .where(eq(adFixedCosts.id, id))
    .returning({ id: adFixedCosts.id });
  return deleted.length > 0;
}
