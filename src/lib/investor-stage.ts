/**
 * Niveau d'inscription d'un investisseur, dérivé des deux booléens venus de SAH.
 * Source de vérité unique pour les 3 libellés affichés dans l'app — ne jamais
 * réécrire ces chaînes en dur ailleurs.
 *
 * Niveaux (du moins avancé au plus avancé) :
 *   1. Inscrit          → compte créé, profil pas encore rempli
 *   2. Profil complété  → profil rempli, KYC pas encore validé
 *   3. Onboardé         → profil + KYC validés, peut investir
 */
export type InvestorStageKey = 'registered' | 'profile_complete' | 'onboarded';

export type InvestorStageInfo = {
  key: InvestorStageKey;
  /** Libellé court pour les badges. */
  label: string;
  /** Classe CSS du badge (cf. design system). */
  badgeClass: string;
};

const REGISTERED: InvestorStageInfo = {
  key: 'registered',
  label: 'Inscrit',
  badgeClass: 'badge badge-neutral',
};
const PROFILE_COMPLETE: InvestorStageInfo = {
  key: 'profile_complete',
  label: 'Profil complété',
  badgeClass: 'badge badge-brand',
};
const ONBOARDED: InvestorStageInfo = {
  key: 'onboarded',
  label: 'Onboardé',
  badgeClass: 'badge badge-success badge-dot',
};

/** Renvoie le niveau le plus avancé atteint par l'investisseur. */
export function getInvestorStage(inv: {
  registrationComplete: boolean;
  onboardingComplete: boolean;
}): InvestorStageInfo {
  if (inv.onboardingComplete) return ONBOARDED;
  if (inv.registrationComplete) return PROFILE_COMPLETE;
  return REGISTERED;
}
