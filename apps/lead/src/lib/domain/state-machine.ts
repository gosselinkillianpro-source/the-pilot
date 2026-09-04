/**
 * Machine à états d'un lead — section 2 de la spec.
 *
 * Pure : aucune base, aucune date. Le service métier applique la transition,
 * journalise dans `lead_events`, puis programme les jobs. Une transition
 * interdite lève `InvalidTransitionError` : on ne « force » jamais un état.
 */

export const LEAD_STATES = [
  'nouveau',
  'a_rappeler',
  'en_appel',
  'qualifie',
  'rdv_pose',
  'a_rappeler_plus_tard',
  'a_nourrir',
  'hors_cible',
  'injoignable',
  'honore',
  'absent',
  'reprogramme',
  'conforme',
  'non_conforme',
  'retour_accepte',
  'retour_refuse',
  'en_cours',
  'signe',
  'perdu',
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export type LeadEventType =
  | 'received' // nouveau → a_rappeler (validation + dédoublonnage OK)
  | 'duplicate' // nouveau → hors_cible (doublon)
  | 'call_started' // → en_appel (« J'appelle »)
  | 'qualified' // en_appel → qualifie
  | 'rdv_posed' // qualifie → rdv_pose
  | 'callback_later' // en_appel → a_rappeler_plus_tard
  | 'callback_due' // a_rappeler_plus_tard → a_rappeler
  | 'callback_requested' // a_rappeler | injoignable → a_rappeler_plus_tard (le lead choisit un créneau via le lien SMS)
  | 'nurture' // en_appel → a_nourrir
  | 'out_of_target' // en_appel | a_rappeler → hors_cible
  | 'attempt_missed' // en_appel → a_rappeler (relance) ou injoignable
  | 'honored' // rdv_pose → honore
  | 'absent' // rdv_pose → absent
  | 'rescheduled' // absent | rdv_pose → reprogramme puis nouveau RDV (rdv_pose)
  | 'rdv_reposed' // reprogramme → rdv_pose
  | 'conform' // honore → conforme
  | 'non_conform' // honore → non_conforme
  | 'return_accepted' // non_conforme → retour_accepte
  | 'return_refused' // non_conforme → retour_refuse
  | 'outcome_in_progress' // conforme | retour_refuse | en_cours → en_cours
  | 'outcome_signed' // conforme | retour_refuse | en_cours → signe
  | 'outcome_lost' // conforme | retour_refuse | en_cours | absent → perdu
  | 'reopened'; // hors_cible | injoignable | a_nourrir → a_rappeler (admin)

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: LeadState,
    readonly event: LeadEventType,
  ) {
    super(`Transition interdite : ${from} + ${event}`);
    this.name = 'InvalidTransitionError';
  }
}

type Rule = { from: readonly LeadState[]; to: LeadState };

const RULES: Record<Exclude<LeadEventType, 'attempt_missed'>, Rule> = {
  received: { from: ['nouveau'], to: 'a_rappeler' },
  duplicate: { from: ['nouveau'], to: 'hors_cible' },
  call_started: {
    from: ['a_rappeler', 'a_rappeler_plus_tard', 'injoignable', 'en_appel'],
    to: 'en_appel',
  },
  qualified: { from: ['en_appel', 'qualifie'], to: 'qualifie' },
  rdv_posed: { from: ['qualifie'], to: 'rdv_pose' },
  callback_later: { from: ['en_appel'], to: 'a_rappeler_plus_tard' },
  callback_due: { from: ['a_rappeler_plus_tard'], to: 'a_rappeler' },
  callback_requested: {
    from: ['a_rappeler', 'injoignable', 'a_rappeler_plus_tard', 'en_appel'],
    to: 'a_rappeler_plus_tard',
  },
  nurture: { from: ['en_appel', 'a_rappeler'], to: 'a_nourrir' },
  out_of_target: { from: ['en_appel', 'a_rappeler', 'qualifie'], to: 'hors_cible' },
  honored: { from: ['rdv_pose'], to: 'honore' },
  absent: { from: ['rdv_pose'], to: 'absent' },
  rescheduled: { from: ['absent', 'rdv_pose'], to: 'reprogramme' },
  rdv_reposed: { from: ['reprogramme'], to: 'rdv_pose' },
  conform: { from: ['honore'], to: 'conforme' },
  non_conform: { from: ['honore'], to: 'non_conforme' },
  return_accepted: { from: ['non_conforme'], to: 'retour_accepte' },
  return_refused: { from: ['non_conforme'], to: 'retour_refuse' },
  outcome_in_progress: { from: ['conforme', 'retour_refuse', 'en_cours'], to: 'en_cours' },
  outcome_signed: { from: ['conforme', 'retour_refuse', 'en_cours'], to: 'signe' },
  outcome_lost: { from: ['conforme', 'retour_refuse', 'en_cours', 'absent'], to: 'perdu' },
  reopened: { from: ['hors_cible', 'injoignable', 'a_nourrir'], to: 'a_rappeler' },
};

export type TransitionContext = {
  /** Pour `attempt_missed` : tentatives après celle qui vient d'échouer, et plafond. */
  attemptsCount?: number;
  maxAttempts?: number;
};

export function nextState(
  from: LeadState,
  event: LeadEventType,
  ctx: TransitionContext = {},
): LeadState {
  if (event === 'attempt_missed') {
    if (from !== 'en_appel') throw new InvalidTransitionError(from, event);
    const attempts = ctx.attemptsCount ?? 1;
    const max = ctx.maxAttempts ?? Number.POSITIVE_INFINITY;
    return attempts >= max ? 'injoignable' : 'a_rappeler';
  }
  const rule = RULES[event];
  if (!rule.from.includes(from)) throw new InvalidTransitionError(from, event);
  return rule.to;
}

export function canTransition(from: LeadState, event: LeadEventType): boolean {
  if (event === 'attempt_missed') return from === 'en_appel';
  return RULES[event].from.includes(from);
}

/** États où le lead attend un appel du setter. */
export const CALLABLE_STATES: readonly LeadState[] = [
  'a_rappeler',
  'a_rappeler_plus_tard',
  'injoignable',
  'en_appel',
];

/** États « fermés » pour le flux téléphonique. */
export const CLOSED_STATES: readonly LeadState[] = ['hors_cible', 'a_nourrir', 'perdu', 'signe'];

export const STATE_LABELS: Record<LeadState, string> = {
  nouveau: 'Nouveau',
  a_rappeler: 'À rappeler',
  en_appel: 'En appel',
  qualifie: 'Qualifié',
  rdv_pose: 'RDV posé',
  a_rappeler_plus_tard: 'À rappeler plus tard',
  a_nourrir: 'À nourrir',
  hors_cible: 'Hors cible',
  injoignable: 'Injoignable',
  honore: 'Honoré',
  absent: 'Absent',
  reprogramme: 'Reprogrammé',
  conforme: 'Conforme',
  non_conforme: 'Non conforme',
  retour_accepte: 'Retour accepté',
  retour_refuse: 'Retour refusé',
  en_cours: 'En cours',
  signe: 'Signé',
  perdu: 'Perdu',
};
