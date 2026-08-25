import type { InvestorListFilters } from '@/lib/db/queries/investor-list';

/**
 * Les VUES de la liste d'investisseurs.
 *
 * Principe : un nouveau besoin métier = une vue, pas une page. C'est ce qui
 * permet de tenir peu d'entrées de navigation avec beaucoup de cas d'usage
 * (modèle des « Smart Views » de Close).
 *
 * Chaque vue est un préréglage de filtres. L'état vit dans l'URL, donc une vue
 * filtrée est un lien partageable — un closer peut envoyer sa liste à un autre.
 *
 * Ces trois vues remplacent trois anciennes pages :
 *   /closing/pipeline      → 'tous'
 *   /closing/portefeuille  → 'portefeuille'
 *   /closing/reinvest      → 'reinvest'
 */

export type ViewKey =
  | 'tous'
  | 'portefeuille'
  | 'reinvest'
  | 'jamais-investi'
  | 'nouveaux'
  | 'non-attribues';

export type InvestorView = {
  key: ViewKey;
  label: string;
  /** Phrase courte affichée sous le titre : à quelle question la vue répond. */
  description: string;
  filters: InvestorListFilters;
  /** La vue se scope sur le closer connecté (le « mon » de « mon portefeuille »). */
  scopedToMe?: boolean;
};

/** Horizon de rappel avant remboursement — repris de l'ancienne page reinvest. */
export const REINVEST_HORIZON_DAYS = 60;
/** En dessous, le rappel de réinvestissement est du bruit (décision Killian). */
export const REINVEST_MIN_EUR = 1000;
/** Fenêtre « nouveau lead », alignée sur le scoring de la file d'appels. */
export const NEW_LEAD_WINDOW_DAYS = 7;

export const INVESTOR_VIEWS: InvestorView[] = [
  {
    key: 'tous',
    label: 'Tous',
    description: 'Toute la base, onboardés en premier.',
    filters: { sort: 'recent' },
  },
  {
    key: 'portefeuille',
    label: 'Mon portefeuille',
    description: 'Les leads qui me sont attribués, dernier appel en premier.',
    filters: { sort: 'last_call' },
    scopedToMe: true,
  },
  {
    key: 'reinvest',
    label: 'Réinvestissement',
    description: `Capital qui revient sous ${REINVEST_HORIZON_DAYS} jours, gros tickets d'abord.`,
    filters: {
      repaymentWithinDays: REINVEST_HORIZON_DAYS,
      minInvested: REINVEST_MIN_EUR,
      sort: 'invested',
    },
  },
  {
    key: 'jamais-investi',
    label: 'Jamais investi',
    description: 'Onboardés KYC qui n’ont encore jamais souscrit.',
    filters: { stage: 'onboarded', invested: 'no', sort: 'recent' },
  },
  {
    key: 'nouveaux',
    label: 'Nouveaux',
    description: `Inscrits sur SAH depuis ${NEW_LEAD_WINDOW_DAYS} jours ou moins.`,
    filters: { signedUpWithinDays: NEW_LEAD_WINDOW_DAYS, sort: 'recent' },
  },
  {
    key: 'non-attribues',
    label: 'Sans closer',
    description: 'Personne ne suit ces leads.',
    filters: { closerId: 'none', sort: 'recent' },
  },
];

export const DEFAULT_VIEW: ViewKey = 'tous';

/** Vue de repli : une clé inconnue dans l'URL ne doit jamais casser la page. */
const FALLBACK_VIEW: InvestorView = {
  key: 'tous',
  label: 'Tous',
  description: 'Toute la base, onboardés en premier.',
  filters: { sort: 'recent' },
};

export function getView(key: string | undefined): InvestorView {
  return INVESTOR_VIEWS.find((v) => v.key === key) ?? FALLBACK_VIEW;
}

/**
 * Filtres effectifs = préréglage de la vue + surcharges venues de l'URL.
 * L'utilisateur peut donc partir d'une vue et l'affiner sans quitter la page.
 */
export function resolveFilters(
  view: InvestorView,
  overrides: Partial<InvestorListFilters>,
  currentUserId: string,
): InvestorListFilters {
  const base: InvestorListFilters = { ...view.filters };
  if (view.scopedToMe) base.closerId = currentUserId;

  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== '') {
      (base as Record<string, unknown>)[k] = v;
    }
  }
  return base;
}
