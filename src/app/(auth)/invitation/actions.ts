'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getSupabaseServerClient, roleRequiresMfa } from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { assignCgpClients } from '@/lib/db/queries/cgp-clients';
import { acceptInvitationRecord, findInvitationByTokenHash } from '@/lib/db/queries/invitations';
import { users } from '@/lib/db/schema';
import {
  hashInvitationToken,
  INVITATION_STATUS_MESSAGE,
  invitationStatus,
  looksLikeInvitationToken,
  MIN_PASSWORD_LENGTH,
} from '@/lib/invitations/token';

/**
 * Accepter une invitation = créer son compte.
 *
 * La personne n'est pas connectée : c'est le serveur (client service) qui crée
 * le compte Auth avec l'e-mail de l'invitation — jamais un autre — et le rôle
 * décidé par l'admin. Puis on la connecte et on l'envoie activer sa 2FA.
 */

export type AcceptError = { error: string };

const schema = z
  .object({
    token: z.string().trim(),
    fullName: z.string().trim().min(2, 'Indique ton prénom et ton nom.').max(80),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`,
      )
      .max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Les deux mots de passe ne sont pas identiques.',
    path: ['confirm'],
  });

export async function acceptInvitationAction(
  _prev: AcceptError | null,
  formData: FormData,
): Promise<AcceptError> {
  const parsed = schema.safeParse({
    token: formData.get('token'),
    fullName: formData.get('fullName'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  const { token, fullName, password } = parsed.data;
  if (!looksLikeInvitationToken(token)) return { error: 'Lien d’invitation invalide.' };

  const now = new Date();
  const inv = await findInvitationByTokenHash(hashInvitationToken(token));
  if (!inv) return { error: 'Invitation introuvable. Demande un nouveau lien à Killian.' };
  const status = invitationStatus(inv, now);
  if (status !== 'pending') return { error: INVITATION_STATUS_MESSAGE[status] };

  // 1. Le compte Auth — e-mail confirmé (c'est l'admin qui a saisi l'adresse), rôle posé.
  const admin = getSupabaseAdminClient();
  const created = await admin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    app_metadata: { role: inv.role },
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? '';
    if (/already|exist|registered/i.test(msg)) {
      return { error: 'Un compte existe déjà pour cette adresse : connecte-toi.' };
    }
    console.error('[invitation] createUser :', msg);
    return { error: 'Impossible de créer le compte pour le moment. Réessaie dans une minute.' };
  }
  const userId = created.data.user.id;

  // 2. La ligne applicative (cible des clés étrangères), avec le compte SAH s'il y en a un.
  await db
    .insert(users)
    .values({ id: userId, email: inv.email, fullName, role: inv.role, sahUserId: inv.sahUserId })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: inv.email, fullName, role: inv.role, sahUserId: inv.sahUserId },
    });
  await acceptInvitationRecord(inv.id, userId, now);

  // 3. Ses clients CGP (inscrits avec son code) lui reviennent tout de suite.
  let cgpAssigned = 0;
  if (inv.sahUserId) {
    try {
      const res = await assignCgpClients({ userId });
      cgpAssigned = res.reduce((n, r) => n + r.assigned, 0);
    } catch (e) {
      console.error('[invitation] attribution CGP :', e instanceof Error ? e.message : e);
    }
  }

  await logAudit({
    userId,
    userEmail: inv.email,
    userRole: inv.role,
    action: 'auth.invitation_accepted',
    resourceType: 'user',
    resourceId: userId,
    metadata: { invitationId: inv.id, role: inv.role, sahUserId: inv.sahUserId, cgpAssigned },
  });

  // 4. Connexion immédiate, puis 2FA (obligatoire pour les closers et admins).
  const supabase = await getSupabaseServerClient();
  const signedIn = await supabase.auth.signInWithPassword({ email: inv.email, password });
  if (signedIn.error) redirect('/login');
  redirect(roleRequiresMfa(inv.role) ? '/mfa/setup' : '/dashboard');
}
