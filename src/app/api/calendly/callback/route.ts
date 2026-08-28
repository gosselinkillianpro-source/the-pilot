import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  exchangeCodeForTokens,
  fetchCalendlyIdentity,
  getOAuthConfig,
  saveConnection,
} from '@/lib/integrations/calendly/oauth';
import { STATE_COOKIE, TARGET_COOKIE } from '../connect/route';

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

  // Connexion déléguée : le cookie dit POUR QUI, mais il ne fait pas foi à lui
  // seul. On revérifie ici le rôle de l'appelant et l'éligibilité de la cible —
  // un cookie forgé ne doit pas suffire à détourner l'agenda d'un collègue.
  const requestedTarget = request.cookies.get(TARGET_COOKIE)?.value;
  const targetUserId = await resolveTargetUser(user.id, user.role, requestedTarget);
  const delegated = targetUserId !== user.id;

  try {
    const tokens = await exchangeCodeForTokens(config, code);
    const identity = await fetchCalendlyIdentity(tokens.access_token);
    await saveConnection({ userId: targetUserId, tokens, identity });

    await logAudit({
      userId: user.id,
      action: delegated ? 'calendly.connect.success_delegated' : 'calendly.connect.success',
      resourceType: 'calendly_connection',
      resourceId: targetUserId,
      // Jamais de jeton dans l'audit : uniquement de quoi savoir quel compte.
      metadata: { calendlyEmail: identity.email, ...(delegated ? { parAdmin: user.id } : {}) },
    });
  } catch (e) {
    await logAudit({
      userId: user.id,
      action: 'calendly.connect.failure',
      resourceType: 'calendly_connection',
      resourceId: targetUserId,
      metadata: { message: e instanceof Error ? e.message : 'erreur inconnue' },
    });
    return back(`erreur=echange&detail=${encodeURIComponent(e instanceof Error ? e.message : '')}`);
  }

  // On revient sur l'agenda concerné, pas sur celui de l'admin : il doit voir
  // tout de suite le résultat de ce qu'il vient de connecter.
  const response = back(
    delegated ? `calendly=connecte&closer=${targetUserId}` : 'calendly=connecte',
  );
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(TARGET_COOKIE);
  return response;
}

/** Même règle qu'au départ du flux : seul un admin délègue, vers du staff actif. */
async function resolveTargetUser(
  userId: string,
  role: string,
  requested: string | undefined,
): Promise<string> {
  if (!requested || requested === userId || role !== 'admin') return userId;
  const rows = await db
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, requested))
    .limit(1);
  const row = rows[0];
  const eligible = row?.active && ['admin', 'closer', 'closer_junior'].includes(row.role);
  return eligible ? row.id : userId;
}
