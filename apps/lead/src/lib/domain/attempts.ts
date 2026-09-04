import type { ServiceHours } from '@/lib/db/schema';
import { addMinutes, nextDayAt, nextServiceOpening } from './time';

/**
 * Règle des rappels (section 2.2) : après un appel sans réponse, on
 * reprogramme à +30 min, puis +3 h, puis le lendemain 10 h (heure de Paris).
 * Après la troisième relance manquée, le lead passe INJOIGNABLE.
 *
 * Interprétation retenue : « 3 tentatives » = 3 RELANCES après le premier
 * appel, ce qui colle aux trois délais listés. Un seul endroit à changer si
 * Killian veut 3 appels au total : MAX_ATTEMPTS.
 */
export const MAX_ATTEMPTS = 4;

/** SMS avec lien de créneau après la deuxième tentative manquée. */
export const SMS_AFTER_ATTEMPT = 2;

export type RetryRule =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'next_day_at'; time: string };

export const RETRY_RULES: readonly RetryRule[] = [
  { kind: 'minutes', minutes: 30 },
  { kind: 'minutes', minutes: 180 },
  { kind: 'next_day_at', time: '10:00' },
];

export type AttemptPlan =
  | { outcome: 'retry'; attemptsCount: number; nextAttemptAt: Date; sendSlotSms: boolean }
  | { outcome: 'unreachable'; attemptsCount: number };

/**
 * Planifie la suite après une tentative manquée. `attemptsCount` = nombre de
 * tentatives déjà faites AVANT celle-ci. Le prochain essai tombe toujours dans
 * les heures de service.
 */
export function planNextAttempt(
  attemptsCount: number,
  now: Date,
  hours: ServiceHours,
  tz?: string,
): AttemptPlan {
  const done = attemptsCount + 1;
  if (done >= MAX_ATTEMPTS) return { outcome: 'unreachable', attemptsCount: done };
  const rule = RETRY_RULES[done - 1] ?? RETRY_RULES[RETRY_RULES.length - 1];
  const raw =
    rule?.kind === 'next_day_at'
      ? nextDayAt(now, rule.time, tz)
      : addMinutes(now, rule?.kind === 'minutes' ? rule.minutes : 30);
  const nextAttemptAt = nextServiceOpening(raw, hours, tz) ?? raw;
  return {
    outcome: 'retry',
    attemptsCount: done,
    nextAttemptAt,
    sendSlotSms: done === SMS_AFTER_ATTEMPT,
  };
}
