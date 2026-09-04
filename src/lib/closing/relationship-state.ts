import type { ClosingStage } from './pipeline';

/**
 * État de la relation avec une personne — DÉDUIT des faits, jamais rangé à la
 * main. C'est ce qui remplace les colonnes du kanban pour les closers : on
 * enregistre ce qui s'est passé, l'état suit.
 *
 * Ordre d'évaluation (le premier vrai gagne) :
 *   client  → au moins une souscription non annulée (fait SAH, prime sur tout)
 *   lost    → étape « perdu », ou dernier appel faux numéro / profil incompatible
 *   meeting → un rendez-vous est calé
 *   paused  → « pas maintenant » loin, 3 tentatives sans réponse, ou étape en sommeil
 *   ready   → KYC validé côté SAH, rien investi : peut investir demain matin
 *   talking → déjà joint au moins une fois (ou étape avancée à la main)
 *   to_contact → tout le reste : jamais joint, moins de 3 tentatives
 *
 * Module pur, testé.
 */

export type RelationshipState =
  | 'to_contact'
  | 'talking'
  | 'meeting'
  | 'ready'
  | 'client'
  | 'paused'
  | 'lost';

export type RelationshipStateMeta = {
  key: RelationshipState;
  label: string;
  hint: string;
  /** Classe badge du design system (badge-*). */
  badge: string;
};

export const RELATIONSHIP_STATES: RelationshipStateMeta[] = [
  {
    key: 'to_contact',
    label: 'À contacter',
    hint: 'Jamais joint, moins de 3 tentatives',
    badge: 'badge-warning',
  },
  {
    key: 'talking',
    label: 'En discussion',
    hint: 'Joint au moins une fois, la suite est planifiée',
    badge: 'badge-neutral',
  },
  { key: 'meeting', label: 'RDV prévu', hint: 'Un rendez-vous est calé', badge: 'badge-ai' },
  {
    key: 'ready',
    label: 'Prêt à investir',
    hint: 'KYC validé côté SAH, aucune souscription',
    badge: 'badge-brand',
  },
  {
    key: 'client',
    label: 'Client',
    hint: 'Au moins une souscription signée',
    badge: 'badge-success',
  },
  {
    key: 'paused',
    label: 'En pause',
    hint: '« Pas maintenant », ou 3 tentatives sans réponse',
    badge: 'badge-neutral',
  },
  {
    key: 'lost',
    label: 'Perdu',
    hint: 'Faux numéro, profil incompatible ou refus',
    badge: 'badge-danger',
  },
];

const DEFAULT_STATE_META: RelationshipStateMeta = {
  key: 'to_contact',
  label: 'À contacter',
  hint: 'Jamais joint, moins de 3 tentatives',
  badge: 'badge-warning',
};

export function relationshipStateMeta(state: RelationshipState): RelationshipStateMeta {
  return RELATIONSHIP_STATES.find((s) => s.key === state) ?? DEFAULT_STATE_META;
}

/** Tentatives sans réponse à partir desquelles on met la personne en pause. */
export const PAUSE_AFTER_MISSED = 3;
/** Une prochaine action plus loin que ça = la personne a demandé du temps. */
export const PAUSE_HORIZON_DAYS = 30;

const DAY_MS = 86_400_000;
const LOSING_OUTCOMES = new Set(['wrong_number', 'profile_incompatible']);

export type RelationshipInput = {
  hasSubscription: boolean;
  onboardingComplete: boolean;
  stage: ClosingStage;
  /** Appels joints (`reached` ou `in_progress`), tout l'historique. */
  reachedCount: number;
  /** Appels sans réponse depuis le dernier contact abouti. */
  missedAttempts: number;
  nextActionAt: Date | null;
  lastOutcome: string | null;
  now: Date;
};

export function relationshipState(input: RelationshipInput): RelationshipState {
  if (input.hasSubscription) return 'client';
  if (input.stage === 'closed_lost' || LOSING_OUTCOMES.has(input.lastOutcome ?? '')) return 'lost';
  if (input.stage === 'meeting_booked') return 'meeting';

  const farAway =
    input.nextActionAt != null &&
    input.nextActionAt.getTime() - input.now.getTime() > PAUSE_HORIZON_DAYS * DAY_MS;
  if (input.stage === 'dormant' || input.missedAttempts >= PAUSE_AFTER_MISSED || farAway) {
    return 'paused';
  }

  if (input.onboardingComplete) return 'ready';

  const advanced: ClosingStage[] = ['interested', 'meeting_done', 'proposal_sent'];
  if (input.reachedCount > 0 || advanced.includes(input.stage)) return 'talking';
  return 'to_contact';
}

/* ============================================================
   MISSIONS — pourquoi on appelle cette personne en ce moment
   ============================================================ */

export type MissionKey =
  | 'first_call'
  | 'thank'
  | 'idle_cash'
  | 'reinvest'
  | 'kyc'
  | 'registration'
  | 'first_investment'
  | 'reactivate'
  | 'relation';

export type Mission = { key: MissionKey; label: string; badge: string };

/** Les files du scoring (buckets 1 à 9), traduites en mission lisible. */
const MISSIONS: Record<number, Mission> = {
  1: { key: 'first_call', label: 'Premier appel', badge: 'badge-success' },
  2: { key: 'thank', label: 'Remercier', badge: 'badge-success' },
  3: { key: 'idle_cash', label: 'Argent à placer', badge: 'badge-brand' },
  4: { key: 'reinvest', label: 'Réinvestir', badge: 'badge-brand' },
  5: { key: 'kyc', label: 'KYC à finir', badge: 'badge-warning' },
  6: { key: 'registration', label: 'Inscription à finir', badge: 'badge-warning' },
  7: { key: 'first_investment', label: 'Premier investissement', badge: 'badge-brand' },
  8: { key: 'reactivate', label: 'Jamais investi', badge: 'badge-neutral' },
  9: { key: 'relation', label: 'Relation', badge: 'badge-neutral' },
};

const RELATION_MISSION: Mission = { key: 'relation', label: 'Relation', badge: 'badge-neutral' };

export const ALL_MISSIONS: Mission[] = Object.values(MISSIONS);

export function missionForBucket(bucket: number): Mission {
  return MISSIONS[bucket] ?? RELATION_MISSION;
}
