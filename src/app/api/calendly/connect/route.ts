import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { buildAuthorizeUrl, getOAuthConfig } from '@/lib/integrations/calendly/oauth';

export const dynamic = 'force-dynamic';

/** Nom du cookie qui porte l'anti-rejeu entre l'aller et le retour OAuth. */
export const STATE_COOKIE = 'calendly_oauth_state';
/**
 * Cookie qui porte le compte DESTINATAIRE de la connexion, quand un admin
 * connecte l'agenda de quelqu'un d'autre. Sa valeur est revalidée au retour :
 * un cookie forgé ne suffit pas, le callback revérifie le rôle et la cible.
 */
export const TARGET_COOKIE = 'calendly_oauth_target';
const STATE_TTL_SECONDS = 600; // le code d'autorisation Calendly expire en 10 min

/**
 * Départ du flux OAuth : envoie le closer autoriser THE PILOT chez Calendly.
 *
 * Le paramètre `state` est un aléa posé aussi en cookie httpOnly. Au retour, on
 * compare les deux : sans ça, un tiers pourrait faire aboutir un callback forgé
 * et rattacher SON compte Calendly à la session d'un de tes closers.
 *
 * `?pour=<userId>` — CONNEXION DÉLÉGUÉE, réservée aux admins. Elle sert au cas
 * réel : l'agenda d'un closer qui n'ouvrira pas THE PILOT lui-même, mais dont
 * l'admin détient l'accès Calendly. L'admin s'authentifie chez Calendly avec le
 * compte de l'intéressé, et le jeton est rangé sur LE COMPTE VISÉ, pas sur le
 * sien — sinon les rendez-vous atterriraient dans le mauvais agenda.
 *
 * Un closer non-admin qui forge ce paramètre connecte simplement le sien : la
 * cible est ignorée, jamais refusée bruyamment.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  const requested = request.nextUrl.searchParams.get('pour');
  const target = await resolveTarget(user.id, user.role, requested);

  const config = getOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL('/rdv?erreur=oauth_non_configure', process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  const state = randomBytes(32).toString('base64url');

  await logAudit({
    userId: user.id,
    action: target.delegated ? 'calendly.connect.start_delegated' : 'calendly.connect.start',
    resourceType: 'calendly_connection',
    resourceId: target.userId,
    metadata: target.delegated ? { pour: target.name ?? target.userId } : undefined,
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // pas 'strict' : le cookie doit survivre au retour depuis Calendly
    path: '/api/calendly',
    maxAge: STATE_TTL_SECONDS,
  };

  const response = NextResponse.redirect(buildAuthorizeUrl(config, state));
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  if (target.delegated) response.cookies.set(TARGET_COOKIE, target.userId, cookieOptions);
  return response;
}

/**
 * Pour quel compte enregistre-t-on la connexion ?
 *
 * Hors admin, toujours le sien. La cible doit être un membre du staff actif :
 * on ne délègue pas vers un compte affilié, dont l'espace n'a pas d'agenda.
 */
async function resolveTarget(
  userId: string,
  role: string,
  requested: string | null,
): Promise<{ userId: string; name: string | null; delegated: boolean }> {
  if (!requested || requested === userId || role !== 'admin') {
    return { userId, name: null, delegated: false };
  }
  const rows = await db
    .select({ id: users.id, fullName: users.fullName, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, requested))
    .limit(1);
  const row = rows[0];
  const eligible = row?.active && ['admin', 'closer', 'closer_junior'].includes(row.role);
  if (!row || !eligible) return { userId, name: null, delegated: false };
  return { userId: row.id, name: row.fullName, delegated: true };
}
