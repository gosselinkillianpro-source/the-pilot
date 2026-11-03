/**
 * Club deal (formulaire de sevenathome.com) : codes envoyés par le widget et
 * libellés affichés. Les codes sont la donnée stockée ; ne jamais les renommer
 * sans migrer les lignes existantes.
 */

// Un choix par opération : l'équipe répartit ensuite entre les dossiers de chaque opération.
export const DOSSIERS = {
  jonage: 'Jonage · Construction (2 dossiers)',
  srl: 'Saint-Romain-de-Lerps · Rénovation',
  npl: 'Espagne · NPL (2 dossiers)',
} as const;

export const MONTANTS = {
  lt2k: 'Moins de 2 000 €',
  '2k-5k': '2 000 à 5 000 €',
  '5k-10k': '5 000 à 10 000 €',
  '10k-25k': '10 000 à 25 000 €',
  '25k-50k': '25 000 à 50 000 €',
  '50k-100k': '50 000 à 100 000 €',
  gt100k: 'Plus de 100 000 €',
  nsp: "Je préfère en parler avec l'équipe",
} as const;

/** Bornes (en euros) de chaque tranche, pour estimer un potentiel. `null` = non borné / non dit. */
export const MONTANT_BOUNDS: Record<MontantCode, { min: number; max: number | null } | null> = {
  lt2k: { min: 0, max: 2_000 },
  '2k-5k': { min: 2_000, max: 5_000 },
  '5k-10k': { min: 5_000, max: 10_000 },
  '10k-25k': { min: 10_000, max: 25_000 },
  '25k-50k': { min: 25_000, max: 50_000 },
  '50k-100k': { min: 50_000, max: 100_000 },
  gt100k: { min: 100_000, max: null },
  nsp: null,
};

export const DISPOS = {
  immediate: 'Immédiatement',
  '15j': 'Sous 15 jours',
  '1m': 'Sous 1 mois',
  plus: 'Plus tard, à définir ensemble',
} as const;

export const STATUTS = {
  investisseur: 'Déjà investisseur',
  membre: 'Membre, pas encore investi',
  nouveau: 'Découvre Seven At Home',
} as const;

export const PROCESSING = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  dossier_envoye: 'Dossier envoyé',
  souscrit: 'A souscrit',
  sans_suite: 'Sans suite',
} as const;

export type DossierCode = keyof typeof DOSSIERS;
export type MontantCode = keyof typeof MONTANTS;
export type DispoCode = keyof typeof DISPOS;
export type StatutCode = keyof typeof STATUTS;
export type ProcessingStatus = keyof typeof PROCESSING;

export const DOSSIER_CODES = Object.keys(DOSSIERS) as DossierCode[];
export const MONTANT_CODES = Object.keys(MONTANTS) as MontantCode[];
export const PROCESSING_CODES = Object.keys(PROCESSING) as ProcessingStatus[];

export function isKeyOf<T extends object>(obj: T, k: unknown): k is keyof T {
  return typeof k === 'string' && Object.hasOwn(obj, k);
}

/** Ligne de `club_deal_interests` telle que renvoyée par PostgreSQL (snake_case). */
export type ClubDealRow = {
  id: string | number;
  ref: string;
  created_at: Date;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  consent_tel: boolean;
  statut: string;
  dossiers: string[];
  montant: string;
  disponibilite: string;
  message: string;
  duplicate_of: string | null;
  processing_status: string;
  notes: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_url: string | null;
  ip: string | null;
  user_agent: string | null;
  updated_at: Date;
};

/** Libellé d'un code, ou le code brut s'il est inconnu (donnée ancienne). */
export function label<T extends object>(map: T, code: string): string {
  return isKeyOf(map, code) ? String(map[code]) : code;
}
