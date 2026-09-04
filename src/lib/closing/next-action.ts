import { parisDateOf, parisMidnightUTC } from './gamification/periods';
import type { ClosingStage } from './pipeline';

/**
 * « Et ensuite ? » — la suite proposée après un appel.
 *
 * Principe (refonte closer, 4 sept 2026) : un appel n'est enregistré qu'avec
 * sa suite. Le closer ne choisit la suite que pour la changer : elle est
 * pré-remplie d'après le résultat. C'est ce qui garantit qu'aucune fiche ne
 * reste sans prochaine action — la condition pour tenir à des centaines de
 * leads sans kanban à ranger.
 *
 *   pas de réponse / répondeur  → réessayer demain, puis à J+3 ; à la 3e
 *                                 tentative : pause 30 jours (plus de sortie
 *                                 définitive de la file)
 *   en cours                    → rappeler demain
 *   joint · intéressé           → proposer un RDV / envoyer une proposition (J+3)
 *   joint · va finir son KYC    → vérifier le KYC (J+2)
 *   joint · pas maintenant      → rappeler à la date donnée (J+14 par défaut)
 *   joint · refus               → clore
 *   faux numéro / incompatible  → clore
 *
 * Module pur, testé. Les heures sont posées à 10 h heure de Paris.
 */

export type CallOutcome =
  | 'reached'
  | 'no_answer'
  | 'voicemail'
  | 'wrong_number'
  | 'profile_incompatible'
  | 'in_progress';

export type ReachedResult = 'interested' | 'will_finish_kyc' | 'not_now' | 'refused';

export const REACHED_RESULTS: { key: ReachedResult; label: string }[] = [
  { key: 'interested', label: 'Intéressé·e' },
  { key: 'will_finish_kyc', label: 'Va finir son KYC' },
  { key: 'not_now', label: 'Pas maintenant' },
  { key: 'refused', label: 'Refus' },
];

export type NextActionKind =
  | 'retry'
  | 'callback'
  | 'kyc_check'
  | 'proposal'
  | 'rdv'
  | 'thanks'
  | 'reinvest'
  | 'resume'
  | 'none';

export const NEXT_ACTION_LABELS: Record<NextActionKind, string> = {
  retry: 'Réessayer',
  callback: 'Rappeler',
  kyc_check: 'Vérifier le KYC',
  proposal: 'Envoyer une proposition',
  rdv: 'Proposer un RDV',
  thanks: 'Appel de remerciement',
  reinvest: 'Proposer un réinvestissement',
  resume: 'Reprendre contact',
  none: 'Aucune suite',
};

/** Suites que le closer peut choisir à la main (dans l'ordre d'affichage). */
export const CHOOSABLE_NEXT_ACTIONS: NextActionKind[] = [
  'rdv',
  'proposal',
  'callback',
  'kyc_check',
  'retry',
  'resume',
  'none',
];

/** Types de `closer_tasks` (colonne texte) qui correspondent à une suite. */
export function taskTypeFor(kind: NextActionKind): string {
  return kind;
}

/** Tentatives sans réponse au bout desquelles on met en pause. */
export const MAX_RETRIES = 3;
export const PAUSE_DAYS = 30;
export const NOT_NOW_DEFAULT_DAYS = 14;
const DEFAULT_HOUR_PARIS = 10;

/** Instant UTC de `jour + plusDays` à `hour` h heure de Paris. */
export function dueAtParis(now: Date, plusDays: number, hour: number = DEFAULT_HOUR_PARIS): Date {
  const today = parisDateOf(now);
  const midnight = parisMidnightUTC(today.year, today.month, today.day + plusDays);
  return new Date(midnight.getTime() + hour * 3_600_000);
}

export type NextActionProposal = {
  kind: NextActionKind;
  /** null quand la suite est « aucune » (fiche close). */
  dueAt: Date | null;
  /** Étape pipeline à poser en même temps, null = laisser la règle actuelle. */
  stage: ClosingStage | null;
  /** Pourquoi cette suite — montré sous le champ. */
  reason: string;
};

export type ProposeInput = {
  outcome: CallOutcome;
  reachedResult?: ReachedResult | null;
  /** Appels sans réponse depuis le dernier contact abouti, CELUI-CI INCLUS. */
  missedAttempts: number;
  now: Date;
};

export function proposeNextAction(input: ProposeInput): NextActionProposal {
  const { outcome, now } = input;

  if (outcome === 'wrong_number' || outcome === 'profile_incompatible') {
    return {
      kind: 'none',
      dueAt: null,
      stage: 'closed_lost',
      reason:
        outcome === 'wrong_number'
          ? 'Faux numéro : la fiche est close.'
          : 'Profil incompatible : la fiche est close.',
    };
  }

  if (outcome === 'no_answer' || outcome === 'voicemail') {
    const attempt = Math.max(1, input.missedAttempts);
    if (attempt >= MAX_RETRIES) {
      return {
        kind: 'resume',
        dueAt: dueAtParis(now, PAUSE_DAYS),
        stage: 'dormant',
        reason: `${attempt} tentatives sans réponse : pause de ${PAUSE_DAYS} jours, puis on retente.`,
      };
    }
    const plusDays = attempt === 1 ? 1 : 3;
    return {
      kind: 'retry',
      dueAt: dueAtParis(now, plusDays),
      stage: 'to_call_back',
      reason: `Tentative ${attempt}/${MAX_RETRIES} : nouvel essai dans ${plusDays} jour${plusDays > 1 ? 's' : ''}, à une autre heure.`,
    };
  }

  if (outcome === 'in_progress') {
    return {
      kind: 'callback',
      dueAt: dueAtParis(now, 1),
      stage: 'contacted',
      reason: 'Échange en cours : on rappelle demain pour conclure.',
    };
  }

  // Joint.
  switch (input.reachedResult) {
    case 'interested':
      return {
        kind: 'rdv',
        dueAt: dueAtParis(now, 3),
        stage: 'interested',
        reason: 'Intéressé·e : proposer un rendez-vous ou envoyer une proposition sous 3 jours.',
      };
    case 'will_finish_kyc':
      return {
        kind: 'kyc_check',
        dueAt: dueAtParis(now, 2),
        stage: 'contacted',
        reason: 'Vérifier dans 2 jours que le KYC est validé, sinon aider.',
      };
    case 'not_now':
      return {
        kind: 'callback',
        dueAt: dueAtParis(now, NOT_NOW_DEFAULT_DAYS),
        stage: 'to_call_back',
        reason: `Pas maintenant : rappel dans ${NOT_NOW_DEFAULT_DAYS} jours, date modifiable.`,
      };
    case 'refused':
      return {
        kind: 'none',
        dueAt: null,
        stage: 'closed_lost',
        reason: 'Refus explicite : la fiche est close.',
      };
    default:
      return {
        kind: 'callback',
        dueAt: dueAtParis(now, 7),
        stage: 'contacted',
        reason: 'Joint : rappel dans 7 jours pour garder le fil.',
      };
  }
}
