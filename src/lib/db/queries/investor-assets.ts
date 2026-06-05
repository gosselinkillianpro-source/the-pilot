import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investorAssets } from '@/lib/db/schema';

export type InvestorAsset = typeof investorAssets.$inferSelect;
export type AssetKind = 'email_proposal' | 'call_script';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Document IA actuel (le plus récent) d'un type donné pour une personne, ou null. */
export async function getLatestAsset(
  investorId: string,
  kind: AssetKind,
): Promise<InvestorAsset | null> {
  if (!UUID_RE.test(investorId)) return null;
  const rows = await db
    .select()
    .from(investorAssets)
    .where(and(eq(investorAssets.investorId, investorId), eq(investorAssets.kind, kind)))
    .orderBy(desc(investorAssets.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
