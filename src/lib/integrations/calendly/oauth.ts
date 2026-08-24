import 'server-only';
import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secret-box';
import { db } from '@/lib/db';
import { calendlyConnections } from '@/lib/db/schema';
import { CalendlyError } from './client';

/**
 * OAuth 2.0 Calendly — une connexion par closer.
 *
 * Trois contraintes de l'API dictent l'implémentation :
 *
 *  1. Le jeton d'accès expire au bout de 2 h. On rafraîchit donc à la volée,
 *     avec une marge de sécurité, avant chaque série d'appels.
 *  2. Les jetons de rafraîchissement TOURNENT : chaque rafraîchissement en
 *     renvoie un nouveau et invalide l'ancien. On réécrit donc immédiatement en
 *     base — perdre ce jeton casse la connexion et oblige le closer à se
 *     reconnecter à la main.
 *  3. Le `redirect_uri` doit être identique au caractère près entre la demande
 *     d'autorisation et l'échange du code. D'où une fonction unique qui le
 *     construit pour les deux.
 *
 * Le code d'autorisation est à usage unique et expire en 10 minutes.
 */

const AUTHORIZE_URL = 'https://auth.calendly.com/oauth/authorize';
const TOKEN_URL = 'https://auth.calendly.com/oauth/token';

/** Marge avant expiration : on rafraîchit plutôt que de risquer un 401 en plein appel. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type CalendlyOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function getOAuthConfig(): CalendlyOAuthConfig | null {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return {
    clientId,
    clientSecret,
    // Doit correspondre EXACTEMENT à une URI déclarée dans l'app Calendly.
    redirectUri: `${appUrl.replace(/\/+$/, '')}/api/calendly/callback`,
  };
}

export function isOAuthConfigured(): boolean {
  return getOAuthConfig() !== null;
}

/** URL vers laquelle envoyer le closer pour qu'il autorise l'accès. */
export function buildAuthorizeUrl(config: CalendlyOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  owner?: string;
  organization?: string;
};

function isTokenResponse(v: unknown): v is TokenResponse {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.access_token === 'string' &&
    typeof o.refresh_token === 'string' &&
    typeof o.expires_in === 'number'
  );
}

/** Calendly attend les identifiants client en Basic auth, corps en form-urlencoded. */
async function postToken(
  config: CalendlyOAuthConfig,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
      cache: 'no-store',
    });
  } catch (e) {
    throw new CalendlyError(
      `Calendly injoignable : ${e instanceof Error ? e.message : 'erreur réseau'}`,
    );
  }

  const raw: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const detail =
      typeof raw === 'object' && raw !== null && 'error_description' in raw
        ? String((raw as Record<string, unknown>).error_description)
        : `HTTP ${res.status}`;
    throw new CalendlyError(`Échange de jeton refusé par Calendly : ${detail}`, res.status);
  }

  if (!isTokenResponse(raw)) {
    throw new CalendlyError('Réponse de jeton Calendly inexploitable.');
  }
  return raw;
}

export async function exchangeCodeForTokens(
  config: CalendlyOAuthConfig,
  code: string,
): Promise<TokenResponse> {
  return postToken(config, {
    grant_type: 'authorization_code',
    code,
    // Identique à celui de la demande d'autorisation, sinon Calendly refuse.
    redirect_uri: config.redirectUri,
  });
}

/** Identité du compte Calendly qui vient d'autoriser (pour l'afficher et le scoper). */
export async function fetchCalendlyIdentity(accessToken: string): Promise<{
  uri: string;
  organization: string;
  email: string;
  name: string | null;
}> {
  const res = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new CalendlyError(
      `Lecture du compte Calendly impossible (HTTP ${res.status})`,
      res.status,
    );
  }
  const raw: unknown = await res.json();
  const resource =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).resource : null;
  if (typeof resource !== 'object' || resource === null) {
    throw new CalendlyError('Compte Calendly illisible.');
  }
  const r = resource as Record<string, unknown>;
  if (typeof r.uri !== 'string' || typeof r.email !== 'string') {
    throw new CalendlyError('Compte Calendly incomplet (uri ou e-mail manquant).');
  }
  return {
    uri: r.uri,
    organization: typeof r.current_organization === 'string' ? r.current_organization : '',
    email: r.email,
    name: typeof r.name === 'string' ? r.name : null,
  };
}

/** Enregistre (ou remplace) la connexion d'un utilisateur. Jetons chiffrés. */
export async function saveConnection(params: {
  userId: string;
  tokens: TokenResponse;
  identity: { uri: string; organization: string; email: string; name: string | null };
}): Promise<void> {
  const { userId, tokens, identity } = params;
  const row = {
    userId,
    calendlyUserUri: identity.uri,
    calendlyOrgUri: identity.organization,
    calendlyEmail: identity.email,
    calendlyName: identity.name,
    accessTokenEnc: encryptSecret(tokens.access_token),
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope ?? null,
    updatedAt: new Date(),
    revokedAt: null,
  };

  await db
    .insert(calendlyConnections)
    .values(row)
    .onConflictDoUpdate({ target: calendlyConnections.userId, set: row });
}

export type CalendlyConnectionInfo = {
  userId: string;
  calendlyEmail: string;
  calendlyName: string | null;
  calendlyUserUri: string;
  connectedAt: Date;
};

/** Connexion active d'un utilisateur (sans exposer le moindre jeton). */
export async function getConnectionInfo(userId: string): Promise<CalendlyConnectionInfo | null> {
  const rows = await db
    .select({
      userId: calendlyConnections.userId,
      calendlyEmail: calendlyConnections.calendlyEmail,
      calendlyName: calendlyConnections.calendlyName,
      calendlyUserUri: calendlyConnections.calendlyUserUri,
      connectedAt: calendlyConnections.connectedAt,
      revokedAt: calendlyConnections.revokedAt,
    })
    .from(calendlyConnections)
    .where(eq(calendlyConnections.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;
  return {
    userId: row.userId,
    calendlyEmail: row.calendlyEmail,
    calendlyName: row.calendlyName,
    calendlyUserUri: row.calendlyUserUri,
    connectedAt: row.connectedAt,
  };
}

/**
 * Jeton d'accès valide pour cet utilisateur, rafraîchi si nécessaire.
 * Renvoie null si le compte n'a pas de connexion active.
 * Lève si le rafraîchissement échoue (jeton révoqué côté Calendly).
 */
export async function getValidAccessToken(
  userId: string,
): Promise<{ accessToken: string; calendlyUserUri: string; calendlyOrgUri: string } | null> {
  const rows = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.userId, userId))
    .limit(1);

  const conn = rows[0];
  if (!conn || conn.revokedAt) return null;

  const stillValid = conn.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now();
  if (stillValid) {
    return {
      accessToken: decryptSecret(conn.accessTokenEnc),
      calendlyUserUri: conn.calendlyUserUri,
      calendlyOrgUri: conn.calendlyOrgUri,
    };
  }

  const config = getOAuthConfig();
  if (!config) throw new CalendlyError('OAuth Calendly non configuré côté serveur.');

  let tokens: TokenResponse;
  try {
    tokens = await postToken(config, {
      grant_type: 'refresh_token',
      refresh_token: decryptSecret(conn.refreshTokenEnc),
    });
  } catch (e) {
    // Un refresh refusé = accès révoqué côté Calendly. On marque la connexion
    // morte pour que l'UI propose de se reconnecter, plutôt que de réessayer
    // en boucle à chaque affichage.
    await db
      .update(calendlyConnections)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(calendlyConnections.userId, userId));
    throw e;
  }

  // Le jeton de rafraîchissement a tourné : on réécrit AVANT de rendre la main.
  await db
    .update(calendlyConnections)
    .set({
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope ?? conn.scope,
      updatedAt: new Date(),
    })
    .where(eq(calendlyConnections.userId, userId));

  return {
    accessToken: tokens.access_token,
    calendlyUserUri: conn.calendlyUserUri,
    calendlyOrgUri: conn.calendlyOrgUri,
  };
}

/** Déconnexion : on garde la ligne (audit) mais on cesse de l'utiliser. */
export async function revokeConnection(userId: string): Promise<void> {
  await db
    .update(calendlyConnections)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(calendlyConnections.userId, userId));
}
