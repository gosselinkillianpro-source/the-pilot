import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { buildAuthorizeUrl, getOAuthConfig } from '@/lib/integrations/calendly/oauth';

export const dynamic = 'force-dynamic';

/** Nom du cookie qui porte l'anti-rejeu entre l'aller et le retour OAuth. */
export const STATE_COOKIE = 'calendly_oauth_state';
const STATE_TTL_SECONDS = 600; // le code d'autorisation Calendly expire en 10 min

/**
 * Départ du flux OAuth : envoie le closer autoriser THE PILOT chez Calendly.
 *
 * Le paramètre `state` est un aléa posé aussi en cookie httpOnly. Au retour, on
 * compare les deux : sans ça, un tiers pourrait faire aboutir un callback forgé
 * et rattacher SON compte Calendly à la session d'un de tes closers.
 */
export async function GET() {
  const user = await getAuthenticatedUser();

  const config = getOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL('/rdv?erreur=oauth_non_configure', process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  const state = randomBytes(32).toString('base64url');

  await logAudit({
    userId: user.id,
    action: 'calendly.connect.start',
    resourceType: 'calendly_connection',
    resourceId: user.id,
  });

  const response = NextResponse.redirect(buildAuthorizeUrl(config, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'lax' et pas 'strict' : le cookie doit survivre au retour depuis Calendly
    path: '/api/calendly',
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
