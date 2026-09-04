/**
 * Catalogue du diagnostic MonExpertPatrimoine — clés et valeurs EXACTES du
 * site (src/pages/diagnostic/index.astro). Les tranches sont ordonnées : c'est
 * ce qui permet de comparer une réponse à un critère d'acheteur (« montant
 * minimum 10k-50k »). Toute modification du formulaire côté site doit être
 * répercutée ici et changer `MEP_ANSWERS_VERSION`.
 */

export const MEP_ANSWERS_VERSION = 'diagnostic-v3';

/** Clés de coordonnées : jamais dans `answers`, elles vivent sur le lead. */
export const MEP_CONTACT_KEYS = ['prenom', 'telephone', 'email', 'consentement', 'statut'] as const;

export type OrderedScale = readonly string[];

/** Tranches ordonnées du plus petit au plus grand (ou du plus urgent au moins urgent pour `urgence`). */
export const MEP_SCALES: Record<string, OrderedScale> = {
  montant: ['moins-10k', '10k-50k', '50k-100k', '100k-250k', '250k-500k', '500k-1m', 'plus-1m'],
  horizon: ['moins-2ans', '2-5ans', '5-10ans', 'plus-10ans'],
  risque: ['aucune', 'faible', 'moderee', 'forte'],
  revenu_cible: ['moins-500', '500-1000', '1000-2000', 'plus-2000'],
  effort_epargne: ['rien', 'moins-200', '200-500', '500-1000', 'plus-1000'],
  impot_annuel: ['moins-2500', '2500-5000', '5000-10000', '10000-20000', 'plus-20000'],
  age: ['moins-40', '40-55', '55-70', 'plus-70'],
  patrimoine: ['moins-100k', '100k-250k', '250k-500k', 'plus-500k'],
  revenus: ['moins-2500', '2500-4000', '4000-6000', 'plus-6000'],
  urgence: ['maintenant', '3mois', 'annee', 'curiosite'],
};

export const MEP_QUESTION_LABELS: Record<string, string> = {
  objectif: 'Objectif principal',
  montant: 'Montant à investir',
  horizon: 'Durée d’immobilisation',
  risque: 'Tolérance au risque',
  revenu_cible: 'Complément de revenu visé',
  statut_pro: 'Situation professionnelle',
  depart_retraite: 'Départ à la retraite',
  effort_epargne: 'Épargne mensuelle',
  impot_annuel: 'Impôt sur le revenu annuel',
  famille: 'Situation familiale',
  transmission_fait: 'Démarches de transmission',
  age: 'Âge',
  patrimoine: 'Patrimoine global',
  immobilier: 'Situation immobilière',
  revenus: 'Revenus nets du foyer',
  urgence: 'Timing du projet',
};

export const MEP_VALUE_LABELS: Record<string, Record<string, string>> = {
  objectif: {
    fructifier: 'Faire fructifier un capital',
    revenus: 'Revenus complémentaires',
    retraite: 'Préparer la retraite',
    impots: 'Payer moins d’impôts',
    transmission: 'Succession / transmission',
  },
  montant: {
    'moins-10k': '< 10 k€',
    '10k-50k': '10 – 50 k€',
    '50k-100k': '50 – 100 k€',
    '100k-250k': '100 – 250 k€',
    '250k-500k': '250 – 500 k€',
    '500k-1m': '500 k€ – 1 M€',
    'plus-1m': '> 1 M€',
  },
  horizon: {
    'moins-2ans': '< 2 ans',
    '2-5ans': '2 – 5 ans',
    '5-10ans': '5 – 10 ans',
    'plus-10ans': '> 10 ans',
  },
  risque: {
    aucune: 'Aucun risque',
    faible: 'Petites variations',
    moderee: 'Variations si rendement',
    forte: 'Performance, à-coups assumés',
  },
  revenu_cible: {
    'moins-500': '< 500 €/mois',
    '500-1000': '500 – 1 000 €/mois',
    '1000-2000': '1 000 – 2 000 €/mois',
    'plus-2000': '> 2 000 €/mois',
  },
  statut_pro: {
    salarie: 'Salarié(e) du privé',
    fonctionnaire: 'Fonctionnaire',
    tns: 'Indépendant(e) / libéral',
    dirigeant: 'Dirigeant(e)',
    retraite: 'Retraité(e)',
    autre: 'Autre',
  },
  depart_retraite: {
    deja: 'Déjà retraité(e)',
    'moins-5': '< 5 ans',
    '5-15': '5 – 15 ans',
    'plus-15': '> 15 ans',
  },
  effort_epargne: {
    rien: 'Rien',
    'moins-200': '< 200 €/mois',
    '200-500': '200 – 500 €/mois',
    '500-1000': '500 – 1 000 €/mois',
    'plus-1000': '> 1 000 €/mois',
  },
  impot_annuel: {
    'moins-2500': '< 2 500 €',
    '2500-5000': '2 500 – 5 000 €',
    '5000-10000': '5 000 – 10 000 €',
    '10000-20000': '10 000 – 20 000 €',
    'plus-20000': '> 20 000 €',
    inconnu: 'Ne sait pas',
  },
  famille: {
    'couple-enfants': 'En couple, avec enfants',
    'couple-sans': 'En couple, sans enfant',
    'seul-enfants': 'Seul(e), avec enfants',
    'seul-sans': 'Seul(e), sans enfant',
    recomposee: 'Famille recomposée',
  },
  transmission_fait: {
    rien: 'Aucune démarche',
    'assurance-vie': 'Assurance vie (clause bénéficiaire)',
    donation: 'Donation faite',
    testament: 'Testament rédigé',
  },
  age: {
    'moins-40': '< 40 ans',
    '40-55': '40 – 55 ans',
    '55-70': '55 – 70 ans',
    'plus-70': '> 70 ans',
  },
  patrimoine: {
    'moins-100k': '< 100 k€',
    '100k-250k': '100 – 250 k€',
    '250k-500k': '250 – 500 k€',
    'plus-500k': '> 500 k€',
  },
  immobilier: {
    proprietaire: 'Propriétaire (RP)',
    'proprietaire-locatif': 'Propriétaire + locatif',
    locataire: 'Locataire',
    loge: 'Logé(e) autrement',
  },
  revenus: {
    'moins-2500': '< 2 500 €',
    '2500-4000': '2 500 – 4 000 €',
    '4000-6000': '4 000 – 6 000 €',
    'plus-6000': '> 6 000 €',
  },
  urgence: {
    maintenant: 'Dès maintenant',
    '3mois': 'Dans les 3 mois',
    annee: 'Dans l’année',
    curiosite: 'Se renseigne',
  },
};

/** Rang d'une valeur dans sa tranche ; -1 si inconnue (valeur libre, nouvelle version…). */
export function rankOf(scaleKey: string, value: string | undefined): number {
  if (!value) return -1;
  const scale = MEP_SCALES[scaleKey];
  if (!scale) return -1;
  return scale.indexOf(value);
}

/** `true` / `false`, ou `null` quand on ne peut pas trancher (réponse absente ou inconnue). */
export function atLeast(scaleKey: string, value: string | undefined, min: string): boolean | null {
  const v = rankOf(scaleKey, value);
  const m = rankOf(scaleKey, min);
  if (v < 0 || m < 0) return null;
  return v >= m;
}

export function atMost(scaleKey: string, value: string | undefined, max: string): boolean | null {
  const v = rankOf(scaleKey, value);
  const m = rankOf(scaleKey, max);
  if (v < 0 || m < 0) return null;
  return v <= m;
}

export function labelFor(key: string, value: string | undefined): string {
  if (!value) return '—';
  return MEP_VALUE_LABELS[key]?.[value] ?? value;
}

export function questionLabel(key: string): string {
  return MEP_QUESTION_LABELS[key] ?? key;
}

/** Sépare les coordonnées (lead) des réponses (answers) d'un payload du site. */
export function splitContactFromFields(fields: Record<string, string>): {
  contact: {
    prenom?: string;
    telephone?: string;
    email?: string;
    consentement?: string;
    statut?: string;
  };
  answers: Record<string, string>;
} {
  const contact: Record<string, string> = {};
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ((MEP_CONTACT_KEYS as readonly string[]).includes(k)) contact[k] = v;
    else answers[k] = v;
  }
  return { contact, answers };
}
