/**
 * Résolution de l'acteur courant pour le Social Hub.
 *
 * `createdBy` est sûr pour les colonnes ayant une FK vers public.users :
 * il vaut null tant que l'utilisateur authentifié (auth.users Supabase) n'a pas
 * de ligne correspondante dans public.users (synchro pas encore en place).
 * `id`/`email` servent à l'audit (pas de contrainte FK bloquante).
 */

import { eq } from 'drizzle-orm';
import { type AuthenticatedUser, getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export type SocialActor = { id: string | null; email: string; createdBy: string | null };

// Le Social Hub est un module STAFF. admin_affiliate (et 'none') en sont exclus :
// c'est le point de passage commun de toutes les actions social → contrôle unique ici.
const SOCIAL_ROLES = ['admin', 'closer', 'closer_junior', 'executive'] as const;

export async function getSocialActor(): Promise<SocialActor> {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser();
  } catch {
    // Pas de session (dev local sans login) — comportement test inchangé.
    return { id: null, email: 'dev-local', createdBy: null };
  }
  // Authentifié : on EXIGE un rôle staff. Un refus (ex. admin_affiliate) DOIT remonter
  // et bloquer l'action — d'où le contrôle hors du try/catch ci-dessus.
  await requireRole(user, [...SOCIAL_ROLES]);
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, user.id)).limit(1);
  return { id: user.id, email: user.email, createdBy: rows[0] ? user.id : null };
}
