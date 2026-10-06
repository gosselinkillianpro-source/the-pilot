/**
 * Colonnes de `users_profiles` (réplique SAH) lues par la synchro investisseurs.
 *
 * SAH fait évoluer son schéma sans prévenir : le 1er oct. 2026, la disparition
 * de `account_id` a bloqué TOUTE la synchro investisseurs pendant 4 jours
 * (« column p.account_id does not exist »). On distingue donc :
 *   - les colonnes INDISPENSABLES : sans elles le statut KYC serait faux pour
 *     tout le monde → la synchro s'arrête avec un message clair ;
 *   - les colonnes FACULTATIVES : simple affichage → lues si présentes, sinon
 *     `null`, et l'upsert garde la valeur déjà connue chez nous.
 *
 * Module pur : la liste des colonnes présentes vient de information_schema.
 */

/** Servent au calcul d'`onboarding_complete` (KYC) : sans elles, pas de synchro. */
export const REQUIRED_PROFILE_COLUMNS = [
  'user_id',
  'wallet_status',
  'lw_onboarding_status',
] as const;

/** Alias SQL lu par la synchro → colonne SAH, lue seulement si elle existe. */
export const OPTIONAL_PROFILE_COLUMNS = {
  kyc_validated_at: 'kyc_validated_at',
  lw_onboarding_id: 'lw_onboarding_id',
  lemonway_account_id: 'account_id',
} as const;

export type OptionalProfileAlias = keyof typeof OPTIONAL_PROFILE_COLUMNS;

export type ProfileColumnPlan = {
  /** Colonnes indispensables absentes ; vide = synchro possible. */
  missingRequired: string[];
  /** Pour chaque alias : la colonne SAH à lire, ou null si elle n'existe plus. */
  optional: Record<OptionalProfileAlias, string | null>;
  /** Colonnes facultatives absentes (lues à null, valeur existante conservée). */
  missingOptional: string[];
};

export function planProfileColumns(presentColumns: readonly string[]): ProfileColumnPlan {
  const present = new Set(presentColumns);
  const missingRequired = REQUIRED_PROFILE_COLUMNS.filter((c) => !present.has(c));

  const entries = Object.entries(OPTIONAL_PROFILE_COLUMNS) as [OptionalProfileAlias, string][];
  const optional = Object.fromEntries(
    entries.map(([alias, column]) => [alias, present.has(column) ? column : null]),
  ) as Record<OptionalProfileAlias, string | null>;
  const missingOptional = entries.filter(([, c]) => !present.has(c)).map(([, c]) => c);

  return { missingRequired, optional, missingOptional };
}
