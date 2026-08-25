/**
 * Tableau de suivi des inscrits webinaire (kanban).
 *
 * Une carte = une personne prise en charge par un closer. Elle naît au moment
 * où quelqu'un s'en occupe — clic « Je prends » ou premier appel enregistré —
 * et avance de colonne en colonne jusqu'à la souscription.
 *
 * Règle de progression (décision Killian, 25/08/2026) : le déplacement à la
 * main fait autorité, l'automatisme ne fait QUE pousser vers l'avant. Un closer
 * qui a classé quelqu'un « Intéressé » ne doit pas le voir retomber dans
 * « Appelé » parce qu'un second appel a été enregistré — sinon le tableau se
 * réécrit tout seul dans le dos de celui qui le tient.
 *
 * Module pur (aucun accès base, aucune date « maintenant ») : l'ordre des
 * colonnes et les transitions sont une règle métier, elles se vérifient par un
 * test plutôt qu'à l'écran.
 */

export type WebinarStage =
  | 'taken'
  | 'called'
  | 'interested'
  | 'account_ready'
  | 'invested'
  | 'lost';

export type StageColumn = {
  stage: WebinarStage;
  label: string;
  /** Ce que la colonne veut dire, en une phrase — affiché en tête de colonne. */
  hint: string;
  /** Variable CSS du thème, pour la pastille de colonne. */
  accent: string;
};

/**
 * Les colonnes, dans l'ordre du parcours.
 *
 * « Compte finalisé » correspond au KYC terminé côté SAH (`onboarding_complete`)
 * : c'est l'étape où la personne peut enfin placer de l'argent. « Perdu » ferme
 * la ligne sans effacer l'historique — la carte quitte la vue de travail.
 */
export const STAGES: StageColumn[] = [
  {
    stage: 'taken',
    label: 'Pris en charge',
    hint: 'Un closer s’en occupe, pas encore appelé',
    accent: 'var(--text-3)',
  },
  {
    stage: 'called',
    label: 'Appelé',
    hint: 'Appel passé, décision pas encore prise',
    accent: 'var(--brand)',
  },
  {
    stage: 'interested',
    label: 'Intéressé',
    hint: 'A manifesté un intérêt concret',
    accent: 'var(--ai)',
  },
  {
    stage: 'account_ready',
    label: 'Compte finalisé',
    hint: 'KYC validé côté SAH — rangement automatique',
    accent: 'var(--warning)',
  },
  {
    stage: 'invested',
    label: 'A investi',
    // Rangement automatique à la synchro SAH (queries/pipeline-auto.ts).
    hint: 'Souscription signée — rangement automatique',
    accent: 'var(--success)',
  },
  {
    stage: 'lost',
    label: 'Perdu',
    hint: 'Injoignable ou profil incompatible',
    accent: 'var(--danger)',
  },
];

const ORDER = new Map<WebinarStage, number>(STAGES.map((c, i) => [c.stage, i]));

export const ALL_STAGES: WebinarStage[] = STAGES.map((c) => c.stage);

export function stageColumn(stage: WebinarStage): StageColumn {
  const found = STAGES.find((c) => c.stage === stage);
  // ALL_STAGES et STAGES viennent de la même source : ce cas n'arrive pas.
  if (!found) throw new Error(`Colonne inconnue : ${stage}`);
  return found;
}

export function isWebinarStage(value: string): value is WebinarStage {
  return ORDER.has(value as WebinarStage);
}

/**
 * Rang d'une colonne dans le parcours. « Perdu » est hors parcours : il ferme
 * la ligne, il ne la fait pas avancer.
 */
function rank(stage: WebinarStage): number {
  return ORDER.get(stage) ?? 0;
}

/**
 * Avancement automatique : ne recule jamais, et ne touche jamais une carte
 * déjà sortie du parcours (investie ou perdue).
 *
 * @param current colonne actuelle, ou null si la personne n'est pas suivie.
 * @param target colonne que l'automatisme voudrait poser.
 * @returns la colonne à écrire, ou null s'il ne faut rien changer.
 */
export function advanceStage(
  current: WebinarStage | null,
  target: WebinarStage,
): WebinarStage | null {
  if (current === null) return target;
  // Une carte classée « A investi » ou « Perdu » a été tranchée par un humain :
  // aucun automatisme ne la déplace.
  if (current === 'invested' || current === 'lost') return null;
  return rank(target) > rank(current) ? target : null;
}

/** Résultats d'appel qui ferment la ligne : la personne sort du parcours. */
const LOSING_OUTCOMES = new Set(['profile_incompatible', 'wrong_number']);

/**
 * Colonne visée après l'enregistrement d'un appel.
 *
 * Un appel qui aboutit à « profil incompatible » ou « mauvais numéro » range la
 * carte dans Perdu : inutile de la laisser encombrer la file de travail. Tout
 * autre résultat — y compris « pas de réponse » — la pose dans « Appelé » : on
 * a bien tenté quelque chose, la relance reste à faire.
 */
export function stageAfterCall(current: WebinarStage | null, outcome: string): WebinarStage | null {
  if (LOSING_OUTCOMES.has(outcome)) {
    // Perdu est une décision, pas une progression : on l'applique sauf si la
    // personne a déjà investi (auquel cas le closer tranchera lui-même).
    if (current === 'invested') return null;
    return current === 'lost' ? null : 'lost';
  }
  return advanceStage(current, 'called');
}
