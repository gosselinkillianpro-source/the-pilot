import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investors } from '@/lib/db/schema';

/**
 * « Sur la plateforme » pour les e-mails du club deal.
 *
 * Lu dans NOTRE miroir `investors` (alimenté par la synchro SAH toutes les
 * 15 min) plutôt que sur la réplique SAH : même information, sans dépendre de
 * la connexion SAH (IP dédiées Render) à chaque affichage. Aucun accès SAH ici.
 */
export type PlatformLevel = 'absent' | 'inscrit' | 'kyc' | 'investi';

export type PlatformStatus = {
  level: PlatformLevel;
  investorId: string | null;
  totalInvested: number;
  projectsCount: number;
};

export const PLATFORM_LABELS: Record<PlatformLevel, string> = {
  absent: 'Pas de compte',
  inscrit: 'Inscrit',
  kyc: 'KYC validé',
  investi: 'Déjà investi',
};

export const NO_ACCOUNT: PlatformStatus = {
  level: 'absent',
  investorId: null,
  totalInvested: 0,
  projectsCount: 0,
};

export async function getPlatformStatuses(
  emails: readonly string[],
): Promise<Map<string, PlatformStatus>> {
  const wanted = [...new Set(emails.map((e) => e.toLowerCase()))];
  const out = new Map<string, PlatformStatus>();
  if (!wanted.length) return out;

  const rows = await db
    .select({
      id: investors.id,
      email: sql<string>`lower(${investors.email})`,
      totalInvested: investors.totalInvested,
      projectsCount: investors.projectsCount,
      onboardingComplete: investors.onboardingComplete,
      kycValidatedAt: investors.kycValidatedAt,
    })
    .from(investors)
    .where(inArray(sql`lower(${investors.email})`, wanted));

  for (const r of rows) {
    const invested = Number(r.totalInvested) || 0;
    const level: PlatformLevel =
      invested > 0 ? 'investi' : r.onboardingComplete || r.kycValidatedAt ? 'kyc' : 'inscrit';
    const prev = out.get(r.email);
    // Deux comptes pour un même e-mail (rare) : on garde le plus avancé.
    const rank: PlatformLevel[] = ['absent', 'inscrit', 'kyc', 'investi'];
    if (prev && rank.indexOf(prev.level) >= rank.indexOf(level)) continue;
    out.set(r.email, {
      level,
      investorId: r.id,
      totalInvested: invested,
      projectsCount: r.projectsCount ?? 0,
    });
  }
  return out;
}
