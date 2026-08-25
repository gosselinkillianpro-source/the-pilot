import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  exchangeCodeForTokens,
  fetchCalendlyIdentity,
  getOAuthConfig,
  saveConnection,
} from '@/lib/integrations/calendly/oauth';
import { STATE_COOKIE } from '../connect/route';

export const dynamic = 'force-dynamic';

function back(reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/rdv?${reason}`, process.env.NEXT_PUBLIC_APP_URL));
}

/** Comparaison à temps constant, pour ne rien apprendre par le temps de réponse. */
function sameState(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Retour de Calendly après autorisation.
 *
 * Le code reçu est à USAGE UNIQUE et expire en 10 minutes : on l'échange
 * immédiatement, sans aucun appel intermédiaire susceptible de le consommer.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  const params = request.nextUrl.searchParams;

  // L'utilisateur a refusé, ou Calendly a renvoyé une erreur.
  const oauthError = params.get('error');
  if (oauthError) {
    return back(`erreur=refus&detail=${encodeURIComponent(oauthError)}`);
  }

  const code = params.get('code');
  const state = params.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || !sameState(state, expectedState)) {
    return back('erreur=state_invalide');
  }

  const config = getOAuthConfig();
  if (!config) return back('erreur=oauth_non_configure');

  try {
    const tokens = await exchangeCodeForTokens(config, code);
    const identity = await fetchCalendlyIdentity(tokens.access_token);
    await saveConnection({ userId: user.id, tokens, identity });

    await logAudit({
      userId: user.id,
      action: 'calendly.connect.success',
      resourceType: 'calendly_connection',
      resourceId: user.id,
      // Jamais de jeton dans l'audit : uniquement de quoi savoir quel compte.
      metadata: { calendlyEmail: identity.email },
    });
  } catch (e) {
    await logAudit({
      userId: user.id,
      action: 'calendly.connect.failure',
      resourceType: 'calendly_connection',
      resourceId: user.id,
      metadata: { message: e instanceof Error ? e.message : 'erreur inconnue' },
    });
    return back(`erreur=echange&detail=${encodeURIComponent(e instanceof Error ? e.message : '')}`);
  }

  const response = back('calendly=connecte');
  response.cookies.delete(STATE_COOKIE);
  return response;
}
