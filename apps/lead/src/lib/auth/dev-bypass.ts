/**
 * Contournement d'authentification — DÉVELOPPEMENT LOCAL UNIQUEMENT.
 * Actif seulement si NODE_ENV !== 'production' ET DISABLE_AUTH === 'true'.
 * En production cette fonction renvoie toujours false : fail-safe par construction.
 */
export function isAuthDisabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DISABLE_AUTH === 'true';
}
