/**
 * CATALOGUE DE MÉTRIQUES — la SEULE définition autorisée de chaque indicateur de THE PILOT.
 *
 * Règle (Phase 1 du chantier « source de vérité ») : aucune métrique ne doit être
 * affichée sans une entrée ici. Chaque métrique a EXACTEMENT 4 attributs obligatoires :
 *   - definition : en français, une phrase, sans ambiguïté.
 *   - source     : la source canonique UNIQUE (jamais un mélange silencieux).
 *   - calcul     : la formule / requête exacte qui produit la valeur.
 *   - (fraîcheur) : fournie à l'affichage via la couche `src/lib/sources/health.ts`
 *                   selon la `source` — pas figée ici car elle évolue à chaque sync.
 *
 * + `decision` : la décision concrète que la métrique sert (sinon elle n'a rien à faire à l'écran).
 *
 * Ce fichier est la référence de CONFIANCE. Il doit rester synchronisé avec le code des requêtes
 * (`src/lib/db/queries/*`, `src/lib/ads/*`) et avec `CATALOGUE_METRIQUES.md` (généré depuis ici).
 * Hors périmètre : le module closing.
 */

/** Source canonique d'une métrique. Une seule par métrique — pas de moyenne, pas de mélange. */
export type SourceKey =
  | 'sah_db' // base Seven At Home (miroir Postgres/Supabase via Drizzle)
  | 'brevo' // API Brevo (email)
  | 'meta_ads' // Meta Marketing API
  | 'google_ads' // Google Ads API
  | 'derived'; // calcul croisant plusieurs sources canoniques (documenté dans `calcul`)

export type MetricUnit = 'eur' | 'count' | 'pct' | 'days' | 'ratio' | 'text';

export type MetricDef = {
  /** Identifiant stable (kebab/snake), clé d'appel partout dans l'app. */
  id: string;
  /** Libellé affiché. */
  label: string;
  /** Définition métier en une phrase, sans ambiguïté. */
  definition: string;
  /** Source canonique unique. */
  source: SourceKey;
  /** Détail de la source : table(s) + fonction(s) précises qui produisent la valeur. */
  sourceDetail: string;
  /** Formule / SQL exact (versionné ici). */
  calcul: string;
  unit: MetricUnit;
  /** Décision concrète servie. */
  decision: string;
  /** Écran(s) principal(aux) où elle s'affiche. */
  screens: string;
};

// Le NON-annulé partout = `status <> 'cancelled'` (les souscriptions annulées ont un
// `canceled_at` côté SAH ; mappées 'cancelled' dans sync.ts `mapSubscriptionStatus`).
const NON_ANNULE = "status <> 'cancelled'";

const DEFS: MetricDef[] = [
  // ───────────────────────── SAH — collecte & investisseurs ─────────────────────────
  {
    id: 'collecte_totale',
    label: 'Collecte totale',
    definition: 'Somme de tous les montants souscrits non annulés depuis le début (€ levés).',
    source: 'sah_db',
    sourceDetail: 'subscriptions · getGlobalStats (dashboard.ts)',
    calcul: `coalesce(sum(amount) filter (where ${NON_ANNULE}), 0) from subscriptions`,
    unit: 'eur',
    decision: 'Pilotage global de la collecte (santé de la levée vs objectif 45 M€).',
    screens: '/dashboard',
  },
  {
    id: 'collecte_mois',
    label: 'Collecte ce mois',
    definition: 'Montants souscrits non annulés signés depuis le 1er du mois calendaire en cours.',
    source: 'sah_db',
    sourceDetail: 'subscriptions.signed_at · getGlobalStats',
    calcul: `coalesce(sum(amount) filter (where ${NON_ANNULE} and signed_at >= date_trunc('month', now())), 0)`,
    unit: 'eur',
    decision: 'Suivi du rythme mensuel → relance commerciale si en retard sur l’objectif.',
    screens: '/dashboard',
  },
  {
    id: 'investisseurs_total',
    label: 'Investisseurs (base totale)',
    definition:
      'Nombre de comptes investisseurs non supprimés (toute la base, qu’ils aient investi ou non).',
    source: 'sah_db',
    sourceDetail: 'investors · getGlobalStats',
    calcul: 'count(*) from investors where deleted_at is null',
    unit: 'count',
    decision: 'Taille de la base → potentiel à convertir (cible du closing).',
    screens: '/dashboard',
  },
  {
    id: 'investisseurs_ayant_investi',
    label: 'Investisseurs ayant investi',
    definition: 'Nombre de personnes distinctes ayant au moins une souscription non annulée.',
    source: 'sah_db',
    sourceDetail: 'subscriptions · getGlobalStats',
    calcul: `count(distinct investor_id) filter (where ${NON_ANNULE}) from subscriptions`,
    unit: 'count',
    decision: 'Base réellement convertie → mesure du taux de conversion de la base.',
    screens: '/dashboard',
  },
  {
    id: 'taux_onboarding_kyc',
    label: 'Taux onboardés (KYC)',
    definition:
      'Part des investisseurs dont le KYC est validé (onboarding_complete), sur la base totale.',
    source: 'sah_db',
    sourceDetail: 'investors.onboarding_complete · getGlobalStats',
    calcul: 'round( count(*) filter (where onboarding_complete) / nullif(count(*),0) * 100 )',
    unit: 'pct',
    decision: 'Goulot KYC avant investissement → déclenche relance onboarding si bas.',
    screens: '/dashboard',
  },
  {
    id: 'souscriptions_total',
    label: 'Souscriptions',
    definition: 'Nombre de souscriptions non annulées (engagements signés).',
    source: 'sah_db',
    sourceDetail: 'subscriptions · getGlobalStats',
    calcul: `count(*) filter (where ${NON_ANNULE}) from subscriptions`,
    unit: 'count',
    decision: 'Volume d’activité commerciale ; dénominateur du ticket moyen par souscription.',
    screens: '/dashboard · /closing/souscriptions',
  },
  {
    id: 'ticket_moyen_investisseur',
    label: 'Ticket moyen / investisseur',
    definition:
      'Montant moyen investi par personne (collecte non annulée ÷ investisseurs distincts).',
    source: 'sah_db',
    sourceDetail: 'subscriptions · getGlobalStats',
    calcul: 'collecte_totale / nullif(investisseurs_ayant_investi, 0)',
    unit: 'eur',
    decision: 'Segmentation valeur → ciblage closing gros tickets.',
    screens: '/dashboard · /closing/souscriptions',
  },
  {
    id: 'souscriptions_annulees',
    label: 'Souscriptions annulées (exclues)',
    definition:
      'Montant des souscriptions au statut annulé (canceled_at côté SAH), exclues de la collecte.',
    source: 'sah_db',
    sourceDetail: 'subscriptions · getSubscriptionsList',
    calcul: "coalesce(sum(amount) filter (where status = 'cancelled'), 0)",
    unit: 'eur',
    decision: 'Transparence du comptage : ce qui n’est PAS compté et pourquoi (désistements SAH).',
    screens: '/closing/souscriptions',
  },

  // ───────────────────────── BREACH (acquisition pubs Killian) ─────────────────────────
  {
    id: 'breach_collecte',
    label: 'Collecte BREACH',
    definition:
      'Collecte non annulée des investisseurs venus des pubs (code bonus ~breach ou breach_level).',
    source: 'sah_db',
    sourceDetail: 'subscriptions ⋈ investors · getBreachStats / getGlobalStats',
    calcul: `coalesce(sum(s.amount) filter (where ${NON_ANNULE.replace('status', 's.status')}), 0) where (i.breach_level is not null or i.bonus_code ilike '%breach%')`,
    unit: 'eur',
    decision: 'ROI du canal d’acquisition pub → justifie le budget pub.',
    screens: '/breach · /dashboard',
  },
  {
    id: 'breach_leads',
    label: 'Leads BREACH',
    definition:
      'Nombre d’investisseurs rattachés aux pubs (breach_level non null ou bonus_code contenant « breach »).',
    source: 'sah_db',
    sourceDetail: 'investors · getGlobalStats / getBreachStats',
    calcul:
      "count(*) filter (where breach_level is not null or bonus_code ilike '%breach%') from investors where deleted_at is null",
    unit: 'count',
    decision: 'Volume de leads générés par les pubs → haut du funnel d’acquisition.',
    screens: '/breach · /dashboard',
  },

  // ───────────────────────── ADS — coût réel croisé SAH (le bon chiffre) ─────────────────────────
  {
    id: 'ads_depense',
    label: 'Dépense ads',
    definition:
      'Montant dépensé en publicité sur la période (Meta + Google), depuis les API des régies.',
    source: 'derived',
    sourceDetail: 'meta-ads + google-ads (overview.ts byPlatform) — seule donnée régie conservée',
    calcul: 'sum(spend) Meta + sum(spend) Google sur la période',
    unit: 'eur',
    decision: 'Numérateur de tout coût d’acquisition ; budget réellement engagé.',
    screens: '/ads',
  },
  {
    id: 'ads_cpa_reel',
    label: 'CPA réel',
    definition:
      'Coût réel par inscrit : dépense d’une régie ÷ vrais inscrits SAH portant son code bonus.',
    source: 'derived',
    sourceDetail:
      'dépense régie ÷ getAttributedCounts (ads-acquisition.ts) — SEVEN-BREACH→Meta, BREACH-VIP→Google',
    calcul: 'spend_regie / nb_inscrits_du_code (sah_created_at sur la période). null si 0 inscrit.',
    unit: 'eur',
    decision: 'Vrai coût d’acquisition (corrige le pixel gonflé) → arbitrage budget par régie.',
    screens: '/ads',
  },
  {
    id: 'ads_cpi_reel',
    label: 'CPI réel',
    definition:
      'Coût par inscrit complet : dépense régie ÷ inscrits du code ayant profil + KYC validés.',
    source: 'derived',
    sourceDetail:
      'dépense régie ÷ getAttributedCounts (registration_complete and onboarding_complete)',
    calcul: 'spend_regie / nb_complets_du_code. null si 0.',
    unit: 'eur',
    decision: 'Coût d’un inscrit qui va au bout → qualité réelle du canal.',
    screens: '/ads',
  },
  {
    id: 'ads_cout_par_investisseur',
    label: 'Coût / investisseur',
    definition:
      'Dépense régie ÷ investisseurs du code ayant signé une souscription non annulée sur la période.',
    source: 'derived',
    sourceDetail: 'dépense régie ÷ getAttributedCounts (signed_at, non annulé)',
    calcul: 'spend_regie / nb_investisseurs_du_code. null si 0.',
    unit: 'eur',
    decision: 'Coût d’acquisition d’un client payant → rentabilité du canal.',
    screens: '/ads',
  },
  {
    id: 'ads_investissement_moyen',
    label: 'Investissement moyen (ads)',
    definition:
      'Ticket moyen des investisseurs d’un code : collecte du code ÷ investisseurs du code.',
    source: 'sah_db',
    sourceDetail: 'getAttributedCounts (collecte ÷ investisseurs)',
    calcul: 'collecte_du_code / nullif(nb_investisseurs_du_code, 0)',
    unit: 'eur',
    decision: 'Valeur d’un investisseur acquis → numérateur de la rentabilité.',
    screens: '/ads',
  },
  {
    id: 'ads_rentabilite',
    label: 'Rentabilité (ads)',
    definition:
      'Ratio investissement moyen ÷ coût par investisseur. >1 = le canal rapporte plus qu’il ne coûte.',
    source: 'derived',
    sourceDetail: 'blended.ts compute()',
    calcul: 'investissement_moyen / coût_par_investisseur (si coût>0). null sinon.',
    unit: 'ratio',
    decision: 'Décision d’investissement budgétaire : scaler le canal si >1, couper si <1.',
    screens: '/ads',
  },

  // ───────────────────────── EMAIL (Brevo) ─────────────────────────
  {
    id: 'email_contacts',
    label: 'Contacts Brevo',
    definition: 'Nombre total de contacts dans le compte Brevo.',
    source: 'brevo',
    sourceDetail: 'API Brevo /contacts (getBrevoContactsCount)',
    calcul: 'count contacts (API Brevo, temps réel)',
    unit: 'count',
    decision: 'Taille de l’audience emailing adressable.',
    screens: '/email',
  },
  {
    id: 'email_taux_ouverture_transac',
    label: 'Taux d’ouverture (transac.)',
    definition: 'Part des emails transactionnels délivrés qui ont été ouverts (cumul).',
    source: 'brevo',
    sourceDetail: 'API Brevo (getBrevoTransactional : opens, delivered)',
    calcul: 'round(opens / nullif(delivered,0) * 1000) / 10',
    unit: 'pct',
    decision: 'Santé de la délivrabilité/engagement email → alerte si chute.',
    screens: '/email',
  },

  // ───────────────────────── PROJETS ─────────────────────────
  {
    id: 'projet_collecte',
    label: 'Collecte par projet',
    definition: 'Montant non annulé collecté sur un projet donné.',
    source: 'sah_db',
    sourceDetail: 'subscriptions ⋈ projects · queries/projects.ts',
    calcul: `coalesce(sum(amount) filter (where ${NON_ANNULE}), 0) group by project_id`,
    unit: 'eur',
    decision: 'Avancement de financement d’un projet → priorisation commerciale.',
    screens: '/projects · /projects/[id]',
  },
  {
    id: 'projet_pourcent_finance',
    label: '% financé',
    definition: 'Part du montant cible d’un projet déjà collectée.',
    source: 'sah_db',
    sourceDetail: 'queries/projects.ts (collected / target)',
    calcul: 'round(projet_collecte / nullif(montant_cible, 0) * 100)',
    unit: 'pct',
    decision: 'Combien il reste à lever sur le projet → effort de collecte à fournir.',
    screens: '/projects · /projects/[id]',
  },

  // ───────────────────────── PERFORMANCE (attribution appels) ─────────────────────────
  {
    id: 'collecte_signee_periode',
    label: 'Collecte signée (période)',
    definition: 'Montant non annulé signé sur la période choisie.',
    source: 'sah_db',
    sourceDetail: 'subscriptions.signed_at · getCloserPerformance',
    calcul: `coalesce(sum(amount) filter (where ${NON_ANNULE} and signed_at in période), 0)`,
    unit: 'eur',
    decision: 'Performance de collecte sur une fenêtre → suivi vs période précédente.',
    screens: '/performance',
  },
  {
    id: 'collecte_attribuee_appels',
    label: 'Collecte attribuée aux appels',
    definition:
      'Collecte signée moins la part non attribuée — créditée aux appels passés dans l’outil (fenêtre 30 j).',
    source: 'sah_db',
    sourceDetail: 'attribution.ts + getCloserPerformance (totalAmount − unattributed.amount)',
    calcul: 'report.totalAmount − report.unattributed.amount',
    unit: 'eur',
    decision: 'ROI réel des appels → arbitrage effort closing. (Fiable seulement ≥ 20 appels.)',
    screens: '/performance',
  },
];

/** Registre indexé par id. */
export const METRICS: Record<string, MetricDef> = Object.freeze(
  Object.fromEntries(DEFS.map((d) => [d.id, d])),
);

/** Toutes les définitions (ordre déclaré). */
export const ALL_METRICS: readonly MetricDef[] = Object.freeze(DEFS);

/** Récupère une définition (ou undefined). */
export function getMetric(id: string): MetricDef | undefined {
  return METRICS[id];
}

/** Libellés humains des sources, pour l'affichage de provenance. */
export const SOURCE_LABELS: Record<SourceKey, string> = {
  sah_db: 'Base Seven At Home',
  brevo: 'Brevo',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  derived: 'Croisé (plusieurs sources)',
};
