import { describe, expect, test } from 'vitest';
import { canTransition, InvalidTransitionError, nextState } from '@/lib/domain/state-machine';

describe('nextState', () => {
  test('parcours nominal : réception → appel → qualifié → RDV posé', () => {
    expect(nextState('nouveau', 'received')).toBe('a_rappeler');
    expect(nextState('a_rappeler', 'call_started')).toBe('en_appel');
    expect(nextState('en_appel', 'qualified')).toBe('qualifie');
    expect(nextState('qualifie', 'rdv_posed')).toBe('rdv_pose');
  });
  test('doublon à la réception', () => {
    expect(nextState('nouveau', 'duplicate')).toBe('hors_cible');
  });
  test('tentative manquée : relance tant que le plafond n’est pas atteint, puis injoignable', () => {
    expect(nextState('en_appel', 'attempt_missed', { attemptsCount: 1, maxAttempts: 4 })).toBe(
      'a_rappeler',
    );
    expect(nextState('en_appel', 'attempt_missed', { attemptsCount: 3, maxAttempts: 4 })).toBe(
      'a_rappeler',
    );
    expect(nextState('en_appel', 'attempt_missed', { attemptsCount: 4, maxAttempts: 4 })).toBe(
      'injoignable',
    );
  });
  test('rappeler plus tard puis échéance', () => {
    expect(nextState('en_appel', 'callback_later')).toBe('a_rappeler_plus_tard');
    expect(nextState('a_rappeler_plus_tard', 'callback_due')).toBe('a_rappeler');
    expect(nextState('a_rappeler_plus_tard', 'call_started')).toBe('en_appel');
    expect(nextState('injoignable', 'callback_requested')).toBe('a_rappeler_plus_tard');
  });
  test('suite du rendez-vous', () => {
    expect(nextState('rdv_pose', 'honored')).toBe('honore');
    expect(nextState('honore', 'conform')).toBe('conforme');
    expect(nextState('honore', 'non_conform')).toBe('non_conforme');
    expect(nextState('non_conforme', 'return_accepted')).toBe('retour_accepte');
    expect(nextState('conforme', 'outcome_signed')).toBe('signe');
    expect(nextState('rdv_pose', 'absent')).toBe('absent');
    expect(nextState('absent', 'rescheduled')).toBe('reprogramme');
    expect(nextState('reprogramme', 'rdv_reposed')).toBe('rdv_pose');
  });
  test('transitions interdites', () => {
    expect(() => nextState('nouveau', 'call_started')).toThrow(InvalidTransitionError);
    expect(() => nextState('a_rappeler', 'rdv_posed')).toThrow(InvalidTransitionError);
    expect(() => nextState('hors_cible', 'attempt_missed')).toThrow(InvalidTransitionError);
    expect(() => nextState('signe', 'honored')).toThrow(InvalidTransitionError);
  });
  test('canTransition reflète les règles', () => {
    expect(canTransition('a_rappeler', 'call_started')).toBe(true);
    expect(canTransition('en_appel', 'attempt_missed')).toBe(true);
    expect(canTransition('qualifie', 'attempt_missed')).toBe(false);
    expect(canTransition('hors_cible', 'reopened')).toBe(true);
  });
});
