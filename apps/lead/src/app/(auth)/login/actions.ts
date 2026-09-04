'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getSupabaseServerClient, loadAppUser } from '@/lib/auth';
import { appUrl } from '@/lib/env';

export type ActionError = { error: string } | null;

const signInSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

/** Connexion des comptes internes (admin, setter) : email + mot de passe. */
export async function signIn(_prev: ActionError, formData: FormData): Promise<ActionError> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: 'Email ou mot de passe incorrect.' };

  if (data.user.app_metadata?.app !== 'lead') {
    await supabase.auth.signOut();
    return { error: 'Ce compte n’a pas accès à The Pilot Lead.' };
  }
  const appUser = await loadAppUser(data.user.id);
  if (!appUser) {
    await supabase.auth.signOut();
    return { error: 'Compte inconnu ou désactivé.' };
  }
  await logAudit({
    userId: appUser.id,
    userEmail: appUser.email,
    userRole: appUser.role,
    action: 'auth.sign_in',
    objectType: 'user',
    objectId: appUser.id,
  });
  redirect(appUser.role === 'buyer' ? '/acheteur' : '/');
}

const magicSchema = z.object({ email: z.string().email('Adresse email invalide.') });

export type MagicState = { error?: string; sent?: boolean } | null;

/** Lien magique pour les acheteurs. Jamais de création de compte : il faut avoir été invité. */
export async function requestMagicLink(_prev: MagicState, formData: FormData): Promise<MagicState> {
  const parsed = magicSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email.trim().toLowerCase(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl()}/auth/callback?next=/acheteur`,
    },
  });
  // Réponse identique connu / inconnu : on ne confirme pas l'existence d'un compte.
  if (error && !/signups not allowed|user not found/i.test(error.message)) {
    return { error: 'Envoi impossible pour le moment. Réessayez dans une minute.' };
  }
  return { sent: true };
}
