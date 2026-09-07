'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole, type UserRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignCgpClients, countCgpClients } from '@/lib/db/queries/cgp-clients';
import {
  createInvitation,
  findInvitationById,
  findOpenInvitationByEmail,
  markInvitationSent,
  revokeInvitation,
  rotateInvitationToken,
  userExistsByEmail,
} from '@/lib/db/queries/invitations';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { users } from '@/lib/db/schema';
import { sendInvitationEmail } from '@/lib/invitations/send';
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationStatus,
  invitationUrl,
} from '@/lib/invitations/token';

/**
 * Gestion des accès depuis la page Équipe — admin seulement.
 *
 * Inviter = créer une ligne + envoyer un lien ; la personne crée son compte
 * elle-même (même e-mail, mot de passe à elle). Le lien n'est montré à l'admin
 * qu'au moment où il est fabriqué (création, renvoi) : la base ne garde que
 * son empreinte.
 */

const INVITABLE_ROLES = ['closer', 'closer_junior', 'executive', 'admin'] as const;

const sahIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/, 'Le n° SAH est un nombre (ex. 1315).')
  .or(z.literal(''));

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  fullName: z.string().trim().min(2, 'Nom trop court.').max(80),
  role: z.enum(INVITABLE_ROLES),
  sahUserId: sahIdSchema,
});

export type InviteInput = z.infer<typeof inviteSchema>;

export type InviteResult =
  | {
      ok: true;
      url: string;
      /** À qui l'e-mail est vraiment parti (adresse de test en mode test), null si l'envoi a échoué. */
      sentTo: string | null;
      testMode: boolean;
      sendError: string | null;
    }
  | { ok: false; message: string };

async function requireAdmin() {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin']);
  await ensureUserRecord(user);
  return user;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/** Envoi best-effort : l'invitation existe même si l'e-mail ne part pas (le lien reste copiable). */
async function trySend(input: {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  inviterName: string;
  url: string;
  expiresAt: Date;
}): Promise<{ sentTo: string | null; testMode: boolean; sendError: string | null }> {
  try {
    const res = await sendInvitationEmail(input);
    await markInvitationSent(input.id, new Date());
    return { sentTo: res.sentTo, testMode: res.testMode, sendError: null };
  } catch (e) {
    return {
      sentTo: null,
      testMode: false,
      sendError: e instanceof Error ? e.message : "L'e-mail n'est pas parti.",
    };
  }
}

async function inviterName(userId: string, email: string): Promise<string> {
  const rows = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.name?.trim() || email;
}

export async function inviteUserAction(input: InviteInput): Promise<InviteResult> {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch {
    return { ok: false, message: 'Réservé aux admins.' };
  }
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  const data = parsed.data;

  if (await userExistsByEmail(data.email)) {
    return { ok: false, message: 'Un compte existe déjà pour cette adresse.' };
  }
  const open = await findOpenInvitationByEmail(data.email);
  if (open) {
    return {
      ok: false,
      message: 'Une invitation est déjà en cours pour cette adresse : renvoie-la plutôt.',
    };
  }

  const now = new Date();
  const token = generateInvitationToken();
  const expiresAt = invitationExpiry(now);
  const id = await createInvitation({
    email: data.email,
    fullName: data.fullName,
    role: data.role as UserRole,
    sahUserId: data.sahUserId || null,
    tokenHash: hashInvitationToken(token),
    invitedBy: user.id,
    expiresAt,
  });
  const url = invitationUrl(appUrl(), token);
  const sent = await trySend({
    id,
    email: data.email,
    fullName: data.fullName,
    role: data.role,
    inviterName: await inviterName(user.id, user.email),
    url,
    expiresAt,
  });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'users.invited',
    resourceType: 'user_invitation',
    resourceId: id,
    metadata: {
      email: data.email,
      role: data.role,
      sahUserId: data.sahUserId || null,
      sentTo: sent.sentTo,
      testMode: sent.testMode,
      sendError: sent.sendError,
    },
  });
  revalidatePath('/equipe');
  return { ok: true, url, ...sent };
}

export async function resendInvitationAction(input: { id: string }): Promise<InviteResult> {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch {
    return { ok: false, message: 'Réservé aux admins.' };
  }
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false, message: 'Invitation invalide.' };
  const inv = await findInvitationById(id.data);
  if (!inv) return { ok: false, message: 'Invitation introuvable.' };
  if (inv.acceptedAt) return { ok: false, message: 'Déjà acceptée : le compte existe.' };

  const now = new Date();
  const token = generateInvitationToken();
  const expiresAt = invitationExpiry(now);
  await rotateInvitationToken(inv.id, hashInvitationToken(token), expiresAt);
  const url = invitationUrl(appUrl(), token);
  const sent = await trySend({
    id: inv.id,
    email: inv.email,
    fullName: inv.fullName,
    role: inv.role,
    inviterName: await inviterName(user.id, user.email),
    url,
    expiresAt,
  });
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'users.invitation_resent',
    resourceType: 'user_invitation',
    resourceId: inv.id,
    metadata: { email: inv.email, sentTo: sent.sentTo, sendError: sent.sendError },
  });
  revalidatePath('/equipe');
  return { ok: true, url, ...sent };
}

export async function revokeInvitationAction(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch {
    return { ok: false, message: 'Réservé aux admins.' };
  }
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false, message: 'Invitation invalide.' };
  const inv = await findInvitationById(id.data);
  if (!inv) return { ok: false, message: 'Invitation introuvable.' };
  if (invitationStatus(inv, new Date()) !== 'pending') {
    return { ok: false, message: "Cette invitation n'est plus en cours." };
  }
  await revokeInvitation(inv.id, new Date());
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'users.invitation_revoked',
    resourceType: 'user_invitation',
    resourceId: inv.id,
    metadata: { email: inv.email },
  });
  revalidatePath('/equipe');
  return { ok: true };
}

const linkSchema = z.object({ userId: z.string().uuid(), sahUserId: sahIdSchema });

export type LinkSahResult =
  | { ok: true; sahUserId: string | null; assigned: number; total: number }
  | { ok: false; message: string };

/**
 * Relie un closer à son compte SAH (CGP) et lui attribue aussitôt ses inscrits
 * libres. Vide = délie (ses clients déjà attribués lui restent).
 */
export async function linkUserToSahAction(input: {
  userId: string;
  sahUserId: string;
}): Promise<LinkSahResult> {
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch {
    return { ok: false, message: 'Réservé aux admins.' };
  }
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  const sahUserId = parsed.data.sahUserId || null;
  const target = await db
    .select({ id: users.id, role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!target[0]) return { ok: false, message: 'Utilisateur introuvable.' };
  if (target[0].role === 'admin_affiliate') {
    return { ok: false, message: 'Le réseau d’un admin affilié se règle par script, pas ici.' };
  }

  await db.update(users).set({ sahUserId }).where(eq(users.id, parsed.data.userId));
  let assigned = 0;
  let total = 0;
  if (sahUserId) {
    const res = await assignCgpClients({ userId: parsed.data.userId });
    assigned = res.reduce((n, r) => n + r.assigned, 0);
    total = (await countCgpClients(sahUserId)).total;
  }
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'users.sah_linked',
    resourceType: 'user',
    resourceId: parsed.data.userId,
    metadata: {
      email: target[0].email,
      sahUserId,
      cgpClientsAssigned: assigned,
      cgpClientsTotal: total,
    },
  });
  revalidatePath('/equipe');
  revalidatePath('/closing/clients');
  revalidatePath('/closing/aujourdhui');
  return { ok: true, sahUserId, assigned, total };
}
