'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getSupabaseServerClient, roleRequiresMfa, type UserRole } from '@/lib/auth';

/* ============================================================
   Schémas de validation
   ============================================================ */
const signInSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres.');

/* ============================================================
   Types de retour
   ============================================================ */
export type ActionError = { error: string };
export type EnrollResult = { factorId: string; qrCode: string; secret: string } | ActionError;

/**
 * Détermine où envoyer l'utilisateur après une authentification réussie,
 * selon son niveau de 2FA (AAL) et son rôle.
 */
async function destinationAfterAuth(role: UserRole): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = data?.currentLevel;
  const nextLevel = data?.nextLevel;

  // A déjà validé le 2FA cette session.
  if (currentLevel === 'aal2') return '/dashboard';

  // Possède un facteur 2FA mais ne l'a pas encore validé → vérification.
  if (nextLevel === 'aal2') return '/mfa';

  // Aucun facteur 2FA et rôle qui l'exige → enrôlement obligatoire.
  if (roleRequiresMfa(role)) return '/mfa/setup';

  return '/dashboard';
}

/* ============================================================
   Connexion (email + mot de passe)
   ============================================================ */
export async function signIn(_prev: ActionError | null, formData: FormData): Promise<ActionError> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: 'Email ou mot de passe incorrect.' };
  }

  const role = (data.user.app_metadata?.role as UserRole | undefined) ?? 'executive';
  const destination = await destinationAfterAuth(role);
  redirect(destination);
}

/* ============================================================
   Déconnexion
   ============================================================ */
export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (data.user) {
    await logAudit({
      userId: data.user.id,
      action: 'auth.sign_out',
      resourceType: 'auth',
      resourceId: data.user.id,
    });
  }
  redirect('/login');
}

/* ============================================================
   2FA — Enrôlement (1ère configuration : génère le QR code)
   ============================================================ */
export async function startMfaEnrollment(): Promise<EnrollResult> {
  const supabase = await getSupabaseServerClient();

  // Nettoyage : supprime d'éventuels facteurs TOTP non vérifiés laissés en plan.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'THE PILOT',
  });

  if (error || !data) {
    return { error: 'Impossible de démarrer la configuration du 2FA. Réessaie.' };
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Valide le code saisi pendant l'enrôlement → active définitivement le 2FA.
 */
export async function confirmMfaEnrollment(
  _prev: ActionError | null,
  formData: FormData,
): Promise<ActionError> {
  const factorId = String(formData.get('factorId') ?? '');
  const parsedCode = codeSchema.safeParse(formData.get('code'));
  if (!factorId) return { error: 'Configuration expirée, recharge la page.' };
  if (!parsedCode.success) {
    return { error: parsedCode.error.issues[0]?.message ?? 'Code invalide.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError || !challenge) {
    return { error: 'Échec de la vérification. Réessaie.' };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: parsedCode.data,
  });
  if (error) {
    return { error: 'Code incorrect. Vérifie ton application d’authentification.' };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await logAudit({
      userId: userData.user.id,
      action: 'auth.mfa_enrolled',
      resourceType: 'auth',
      resourceId: userData.user.id,
    });
  }

  redirect('/dashboard');
}

/* ============================================================
   2FA — Vérification (connexions suivantes : saisie du code)
   ============================================================ */
export async function verifyMfaChallenge(
  _prev: ActionError | null,
  formData: FormData,
): Promise<ActionError> {
  const parsedCode = codeSchema.safeParse(formData.get('code'));
  if (!parsedCode.success) {
    return { error: parsedCode.error.issues[0]?.message ?? 'Code invalide.' };
  }

  const supabase = await getSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) {
    // Pas de facteur vérifié → repasser par l'enrôlement.
    redirect('/mfa/setup');
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: totp.id,
  });
  if (challengeError || !challenge) {
    return { error: 'Échec de la vérification. Réessaie.' };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code: parsedCode.data,
  });
  if (error) {
    return { error: 'Code incorrect. Vérifie ton application d’authentification.' };
  }

  redirect('/dashboard');
}
