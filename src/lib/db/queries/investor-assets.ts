import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investorAssets } from '@/lib/db/schema';

export type InvestorAsset = typeof investorAssets.$inferSelect;
export type AssetKind = 'email_proposal' | 'call_script';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une génération met quelques dizaines de secondes ; au-delà de ce délai, une
 * ligne encore « generating » est un orphelin (serveur redémarré en cours de
 * route) — sans ce garde-fou, le panneau restait bloqué « en cours »
 * indéfiniment, sans aucun bouton de sortie.
 */
const GENERATING_STALE_MIN = 10;

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
    .limit(2);
  const latest = rows[0] ?? null;
  if (!latest) return null;
  const isStaleGenerating =
    latest.status === 'generating' &&
    Date.now() - new Date(latest.updatedAt).getTime() > GENERATING_STALE_MIN * 60_000;
  if (!isStaleGenerating) return latest;
  // Génération abandonnée : on la purge et on ressert le document précédent
  // (la régénération ne supprime l'ancien qu'après un succès).
  await db.delete(investorAssets).where(eq(investorAssets.id, latest.id));
  return rows[1] ?? null;
}
