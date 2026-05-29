/**
 * Résolution de l'acteur courant pour le Social Hub.
 *
 * `createdBy` est sûr pour les colonnes ayant une FK vers public.users :
 * il vaut null tant que l'utilisateur authentifié (auth.users Supabase) n'a pas
 * de ligne correspondante dans public.users (synchro pas encore en place).
 * `id`/`email` servent à l'audit (pas de contrainte FK bloquante).
 */

import { eq } from 'drizzle-orm';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export type SocialActor = { id: string | null; email: string; createdBy: string | null };

export async function getSocialActor(): Promise<SocialActor> {
  try {
    const user = await getAuthenticatedUser();
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return { id: user.id, email: user.email, createdBy: rows[0] ? user.id : null };
  } catch {
    return { id: null, email: 'dev-local', createdBy: null };
  }
}
