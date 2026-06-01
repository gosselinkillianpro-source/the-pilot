/**
 * Interrupteur de contournement d'authentification — DÉVELOPPEMENT LOCAL UNIQUEMENT.
 *
 * Actif SEULEMENT si les deux conditions sont vraies :
 *   1. NODE_ENV !== 'production'   (en prod sur Vercel, NODE_ENV='production')
 *   2. DISABLE_AUTH === 'true'     (réglage explicite, présent uniquement dans .env.local)
 *
 * → En production, cette fonction renvoie TOUJOURS false : l'auth ne peut pas être désactivée,
 *   même si la variable traînait quelque part. Fail-safe par construction.
 *
 * ⚠️ À RETIRER de .env.local (DISABLE_AUTH) avant toute mise en ligne réelle.
 */
export function isAuthDisabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DISABLE_AUTH === 'true';
}
