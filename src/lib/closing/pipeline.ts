/**
 * Tableau de suivi des appels (kanban closing).
 *
 * Ce qui manquait (constat Killian, 25/08/2026) : un closer prend la file
 * « Nouveau 7 jours », appelle, clique « Appelé », qualifie le résultat… et
 * RIEN ne se passe ensuite. La personne disparaît de la file pendant 3 jours
 * puis y revient, sans qu'on sache où elle en est.
 *
 * Désormais, la qualification range la personne dans une colonne :
 *
 *   Appelé → À rappeler → Intéressé → RDV → Proposition → A investi
 *                                                       ↘ Injoignable / incompatible
 *
 * ⚠️ RÈGLE DES 3 TENTATIVES. Un appel sans réponse remet la carte dans
 * « À rappeler » et compte une tentative. À la TROISIÈME sans réponse, la carte
 * bascule en « Injoignable » — donc hors de la file d'appels, qui exclut déjà
 * `closed_lost`. C'est la demande explicite : vider les listes plutôt que
 * laisser traîner des numéros qui ne décrochent jamais.
 *
 * ⚠️ « Profil incompatible » et « mauvais numéro » sortent la personne
 * immédiatement, sans attendre trois tentatives.
 *
 * Le compteur de tentatives n'est stocké nulle part : il se compte depuis les
 * appels enregistrés, DEPUIS LE DERNIER CONTACT ABOUTI. Quelqu'un qu'on a joint
 * puis qui ne répond plus repart donc de zéro — sinon un client de longue date
 * finirait « injoignable » à cause de trois appels manqués étalés sur un an.
 *
 * Module pur (aucun accès base, aucune date « maintenant ») : ces règles
 * décident qui sort de la file de travail, elles se vérifient par un test.
 */

/** Valeurs de l'enum `pipeline_stage` en base. */
export type ClosingStage =
  | 'new'
  | 'contacted'
  | 'to_call_back'
  | 'interested'
  | 'meeting_booked'
  | 'meeting_done'
  | 'proposal_sent'
  | 'closed_won'
  | 'closed_lost'
  | 'dormant';

/** Nombre d'appels sans réponse au-delà duquel on cesse de relancer. */
export const MAX_CALL_ATTEMPTS = 3;

export type ClosingColumn = {
  /** Étape posée quand on dépose une carte dans cette colonne. */
  stage: ClosingStage;
  label: string;
  hint: string;
  accent: string;
  /**
   * Autres étapes rangées dans cette colonne. L'enum en base a plus de valeurs
   * que le tableau n'a de colonnes ; sans ce repli, une fiche marquée
   * « RDV fait » par le formulaire de qualification n'apparaîtrait NULLE PART.
   */
  absorbs: ClosingStage[];
};

export const CLOSING_COLUMNS: ClosingColumn[] = [
  {
    stage: 'contacted',
    label: 'Appelé',
    hint: 'Appel passé, résultat pas encore tranché',
    accent: 'var(--text-3)',
    absorbs: [],
  },
  {
    stage: 'to_call_back',
    label: 'À rappeler',
    hint: `Pas de réponse — ${MAX_CALL_ATTEMPTS} tentatives puis injoignable`,
    accent: 'var(--warning)',
    absorbs: ['dormant'],
  },
  {
    stage: 'interested',
    label: 'Intéressé',
    hint: 'A répondu et veut avancer',
    accent: 'var(--brand)',
    absorbs: [],
  },
  {
    stage: 'meeting_booked',
    label: 'RDV',
    hint: 'Rendez-vous calé ou déjà honoré',
    accent: 'var(--ai)',
    absorbs: ['meeting_done'],
  },
  {
    stage: 'proposal_sent',
    label: 'Proposition',
    hint: 'Projet envoyé, décision en attente',
    accent: 'var(--ai)',
    absorbs: [],
  },
  {
    stage: 'closed_won',
    label: 'A investi',
    hint: 'Souscription signée',
    accent: 'var(--success)',
    absorbs: [],
  },
  {
    stage: 'closed_lost',
    label: 'Injoignable / incompatible',
    hint: "Sorti de la file d'appels",
    accent: 'var(--danger)',
    absorbs: [],
  },
];

/** Libellés de TOUTES les étapes, y compris celles repliées dans une colonne. */
export const CLOSING_STAGE_LABELS: Record<ClosingStage, string> = {
  new: 'Nouveau',
  contacted: 'Appelé',
  to_call_back: 'À rappeler',
  interested: 'Intéressé',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'Proposition envoyée',
  closed_won: 'A investi',
  closed_lost: 'Injoignable / incompatible',
  dormant: 'En sommeil',
};

const ALL_STAGES = Object.keys(CLOSING_STAGE_LABELS) as ClosingStage[];

export function isClosingStage(value: string): value is ClosingStage {
  return (ALL_STAGES as string[]).includes(value);
}

/**
 * Colonne où afficher une étape. `null` = hors tableau : `new` désigne une
 * personne jamais appelée, elle vit dans la file d'appels, pas dans le suivi.
 */
export function columnForStage(stage: ClosingStage): ClosingColumn | null {
  if (stage === 'new') return null;
  return (
    CLOSING_COLUMNS.find((c) => c.stage === stage) ??
    CLOSING_COLUMNS.find((c) => c.absorbs.includes(stage)) ??
    null
  );
}

/** Résultats d'appel qui ferment la ligne sans attendre les trois tentatives. */
const DISQUALIFYING = new Set(['wrong_number', 'profile_incompatible']);
/** Résultats « la personne n'a pas décroché ». */
const NO_CONTACT = new Set(['no_answer', 'voicemail']);

export type QualificationMove = {
  stage: ClosingStage;
  /** Explication montrée au closer : il doit comprendre pourquoi la carte bouge. */
  reason: string;
};

/**
 * Où va la personne après qualification d'un appel.
 *
 * @param outcome résultat choisi par le closer.
 * @param attempts nombre d'appels sans réponse DEPUIS le dernier contact abouti,
 *                 celui qu'on vient de qualifier inclus.
 */
export function stageAfterQualification(outcome: string, attempts: number): QualificationMove {
  if (DISQUALIFYING.has(outcome)) {
    return {
      stage: 'closed_lost',
      reason:
        outcome === 'wrong_number'
          ? 'Mauvais numéro : sorti de la file.'
          : 'Profil incompatible : sorti de la file.',
    };
  }
  if (NO_CONTACT.has(outcome)) {
    if (attempts >= MAX_CALL_ATTEMPTS) {
      return {
        stage: 'closed_lost',
        reason: `${attempts} tentatives sans réponse : classé injoignable et sorti de la file.`,
      };
    }
    return {
      stage: 'to_call_back',
      reason: `Tentative ${attempts}/${MAX_CALL_ATTEMPTS} — à rappeler.`,
    };
  }
  // Joint, ou appel en cours : la personne est traitée, au closer de dire la
  // suite. On ne présume pas de son intérêt à sa place.
  return { stage: 'contacted', reason: 'Appel abouti — à qualifier dans le suivi.' };
}

/**
 * Faut-il appliquer ce mouvement automatique, sachant l'étape actuelle ?
 *
 * Une carte déjà avancée à la main (Intéressé, RDV, Proposition, A investi) ne
 * doit pas retomber dans « Appelé » parce qu'on vient de la rappeler. Seuls
 * deux mouvements passent outre : les sorties de file, qui sont des décisions.
 */
export function shouldApplyMove(current: ClosingStage, next: ClosingStage): boolean {
  if (current === next) return false;
  if (next === 'closed_lost') return current !== 'closed_won';
  if (current === 'closed_won' || current === 'closed_lost') return false;
  // « Appelé » et « À rappeler » sont les deux états d'attente : on peut passer
  // de l'un à l'autre, mais jamais redescendre depuis une étape plus avancée.
  const waiting: ClosingStage[] = ['new', 'contacted', 'to_call_back'];
  return waiting.includes(current);
}

/* ============================================================
   FILES D'ORIGINE — d'où venait la personne quand on l'a appelée
   ============================================================ */

/**
 * Les files d'appels (buckets du scoring), regroupées pour le filtre du tableau.
 *
 * Neuf files à l'écran seraient illisibles : on garde celles qui correspondent à
 * une intention commerciale distincte et on range le reste dans « Autres ».
 * La clé est figée en base à l'entrée dans le suivi — un libellé peut donc
 * changer sans réécrire l'historique.
 */
export const QUEUE_SOURCES: { key: string; label: string; buckets: number[] }[] = [
  { key: 'new_lead', label: 'Nouveaux inscrits', buckets: [1] },
  { key: 'new_investor', label: 'Nouveaux investisseurs', buckets: [2] },
  { key: 'idle_cash', label: 'Argent à placer', buckets: [3] },
  { key: 'repayment', label: 'Échéance proche', buckets: [4] },
  { key: 'unblock', label: 'Déblocage KYC / inscription', buckets: [5, 6] },
  { key: 'other', label: 'Autres files', buckets: [7, 8, 9] },
];

/** Clé de file à figer pour un bucket de scoring. */
export function queueSourceKey(bucket: number | null | undefined): string | null {
  if (bucket == null) return null;
  return QUEUE_SOURCES.find((s) => s.buckets.includes(bucket))?.key ?? 'other';
}

/** Libellé affichable d'une clé de file. Null = origine inconnue (fiches d'avant le tableau). */
export function queueSourceLabel(key: string | null | undefined): string {
  if (!key) return 'Origine inconnue';
  return QUEUE_SOURCES.find((s) => s.key === key)?.label ?? 'Autres files';
}
