import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import type { UserRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { userInvitations, users } from '@/lib/db/schema';

/**
 * Invitations à rejoindre THE PILOT — accès base.
 *
 * Une invitation = une adresse, un rôle, un jeton (haché). L'admin la crée,
 * la renvoie (nouveau jeton) ou l'annule ; la personne l'accepte une seule fois.
 */

export type InvitationRecord = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  sahUserId: string | null;
  invitedBy: string | null;
  inviterName: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastSentAt: Date | null;
  sendCount: number;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

const selection = {
  id: userInvitations.id,
  email: userInvitations.email,
  fullName: userInvitations.fullName,
  role: userInvitations.role,
  sahUserId: userInvitations.sahUserId,
  invitedBy: userInvitations.invitedBy,
  inviterName: users.fullName,
  createdAt: userInvitations.createdAt,
  expiresAt: userInvitations.expiresAt,
  lastSentAt: userInvitations.lastSentAt,
  sendCount: userInvitations.sendCount,
  acceptedAt: userInvitations.acceptedAt,
  revokedAt: userInvitations.revokedAt,
};

export async function findInvitationByTokenHash(
  tokenHash: string,
): Promise<InvitationRecord | null> {
  const rows = await db
    .select(selection)
    .from(userInvitations)
    .leftJoin(users, eq(users.id, userInvitations.invitedBy))
    .where(eq(userInvitations.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function findInvitationById(id: string): Promise<InvitationRecord | null> {
  const rows = await db
    .select(selection)
    .from(userInvitations)
    .leftJoin(users, eq(users.id, userInvitations.invitedBy))
    .where(eq(userInvitations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Les 50 dernières invitations, la plus récente d'abord (page Équipe). */
export async function listInvitations(): Promise<InvitationRecord[]> {
  return db
    .select(selection)
    .from(userInvitations)
    .leftJoin(users, eq(users.id, userInvitations.invitedBy))
    .orderBy(desc(userInvitations.createdAt))
    .limit(50);
}

/** Une invitation encore ouverte (ni acceptée, ni annulée, ni expirée) pour cette adresse. */
export async function findOpenInvitationByEmail(email: string): Promise<InvitationRecord | null> {
  const rows = await db
    .select(selection)
    .from(userInvitations)
    .leftJoin(users, eq(users.id, userInvitations.invitedBy))
    .where(
      sql`lower(${userInvitations.email}) = lower(${email})
        and ${userInvitations.acceptedAt} is null
        and ${userInvitations.revokedAt} is null
        and ${userInvitations.expiresAt} > now()`,
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Un compte applicatif existe-t-il déjà pour cette adresse ? */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return rows.length > 0;
}

export async function createInvitation(input: {
  email: string;
  fullName: string | null;
  role: UserRole;
  sahUserId: string | null;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: Date;
}): Promise<string> {
  const rows = await db
    .insert(userInvitations)
    .values({
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: input.role,
      sahUserId: input.sahUserId,
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy,
      expiresAt: input.expiresAt,
    })
    .returning({ id: userInvitations.id });
  return rows[0]?.id ?? '';
}

/** Après un envoi (réussi) : compteur et date. */
export async function markInvitationSent(id: string, at: Date): Promise<void> {
  await db
    .update(userInvitations)
    .set({ lastSentAt: at, sendCount: sql`${userInvitations.sendCount} + 1` })
    .where(eq(userInvitations.id, id));
}

/** Renvoi : nouveau jeton, nouvelle échéance — l'ancien lien ne marche plus. */
export async function rotateInvitationToken(
  id: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db
    .update(userInvitations)
    .set({ tokenHash, expiresAt, revokedAt: null })
    .where(eq(userInvitations.id, id));
}

export async function revokeInvitation(id: string, at: Date): Promise<void> {
  await db.update(userInvitations).set({ revokedAt: at }).where(eq(userInvitations.id, id));
}

export async function acceptInvitationRecord(id: string, userId: string, at: Date): Promise<void> {
  await db
    .update(userInvitations)
    .set({ acceptedAt: at, acceptedUserId: userId })
    .where(eq(userInvitations.id, id));
}
