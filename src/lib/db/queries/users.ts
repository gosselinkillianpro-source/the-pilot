import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type { AuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

/** Nom affichable dérivé de l'email (fallback si pas de nom). */
function deriveName(email: string): string {
  const local = email.split('@')[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ') || local
  );
}

/**
 * Garantit que l'utilisateur authentifié a une ligne dans la table interne `users`.
 * Les comptes sont créés côté Supabase Auth (script create-user) ; cette table
 * applicative est la cible des clés étrangères (closer assigné, auteur d'appel,
 * audit…). On la remplit au 1er usage pour éviter toute violation de FK.
 *
 * Idempotent : upsert sur l'id (= auth uid). Met l'email/rôle à jour.
 */
export async function ensureUserRecord(u: AuthenticatedUser): Promise<void> {
  await db
    .insert(users)
    .values({ id: u.id, email: u.email, fullName: deriveName(u.email), role: u.role })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: sql`excluded.email`, role: sql`excluded.role` },
    });
}

/**
 * « Vu à l'instant » : met à jour users.last_seen_at, au plus une fois par ~45 s
 * (la condition de date évite d'écrire à chaque navigation). Base de l'indicateur
 * « en ligne » du menu Équipe. Sans effet si la ligne n'existe pas encore.
 */
export async function touchLastSeen(userId: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(users.id, userId),
          sql`(${users.lastSeenAt} is null or ${users.lastSeenAt} < now() - interval '45 seconds')`,
        ),
      );
  } catch {
    // Présence = best-effort : ne JAMAIS bloquer le rendu d'une page si cet update échoue.
  }
}
