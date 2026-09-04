import { describe, expect, test } from 'vitest';
import { dueAtParis, proposeNextAction } from '@/lib/closing/next-action';

/** Vendredi 4 septembre 2026, 14 h à Paris (12 h UTC, heure d'été). */
const NOW = new Date('2026-09-04T12:00:00Z');

describe('dueAtParis', () => {
  test('pose l’heure à 10 h heure de Paris le jour voulu', () => {
    // 5 septembre 10 h Paris = 08 h UTC (heure d'été).
    expect(dueAtParis(NOW, 1).toISOString()).toBe('2026-09-05T08:00:00.000Z');
    // Passage à l'heure d'hiver le 25 octobre : 10 h Paris = 09 h UTC.
    expect(dueAtParis(NOW, 60).toISOString()).toBe('2026-11-03T09:00:00.000Z');
  });
});

describe('proposeNextAction — la suite est pré-remplie', () => {
  test('faux numéro et profil incompatible closent la fiche', () => {
    const a = proposeNextAction({ outcome: 'wrong_number', missedAttempts: 0, now: NOW });
    expect(a).toMatchObject({ kind: 'none', dueAt: null, stage: 'closed_lost' });
    const b = proposeNextAction({ outcome: 'profile_incompatible', missedAttempts: 0, now: NOW });
    expect(b.stage).toBe('closed_lost');
  });

  test('pas de réponse : demain, puis J+3, puis pause de 30 jours', () => {
    const first = proposeNextAction({ outcome: 'no_answer', missedAttempts: 1, now: NOW });
    expect(first.kind).toBe('retry');
    expect(first.dueAt?.toISOString()).toBe('2026-09-05T08:00:00.000Z');
    expect(first.stage).toBe('to_call_back');

    const second = proposeNextAction({ outcome: 'voicemail', missedAttempts: 2, now: NOW });
    expect(second.dueAt?.toISOString()).toBe('2026-09-07T08:00:00.000Z');

    const third = proposeNextAction({ outcome: 'no_answer', missedAttempts: 3, now: NOW });
    expect(third.kind).toBe('resume');
    expect(third.stage).toBe('dormant');
    expect(third.dueAt?.toISOString()).toBe('2026-10-04T08:00:00.000Z');
  });

  test('un compteur à zéro vaut première tentative', () => {
    expect(proposeNextAction({ outcome: 'no_answer', missedAttempts: 0, now: NOW }).reason).toMatch(
      /Tentative 1\/3/,
    );
  });

  test('joint : la suite dépend de ce qui s’est dit', () => {
    const interested = proposeNextAction({
      outcome: 'reached',
      reachedResult: 'interested',
      missedAttempts: 0,
      now: NOW,
    });
    expect(interested).toMatchObject({ kind: 'rdv', stage: 'interested' });
    expect(interested.dueAt?.toISOString()).toBe('2026-09-07T08:00:00.000Z');

    const kyc = proposeNextAction({
      outcome: 'reached',
      reachedResult: 'will_finish_kyc',
      missedAttempts: 0,
      now: NOW,
    });
    expect(kyc).toMatchObject({ kind: 'kyc_check', stage: 'contacted' });

    const notNow = proposeNextAction({
      outcome: 'reached',
      reachedResult: 'not_now',
      missedAttempts: 0,
      now: NOW,
    });
    expect(notNow).toMatchObject({ kind: 'callback', stage: 'to_call_back' });
    expect(notNow.dueAt?.toISOString()).toBe('2026-09-18T08:00:00.000Z');

    const refused = proposeNextAction({
      outcome: 'reached',
      reachedResult: 'refused',
      missedAttempts: 0,
      now: NOW,
    });
    expect(refused).toMatchObject({ kind: 'none', stage: 'closed_lost', dueAt: null });
  });

  test('joint sans précision : rappel dans 7 jours ; en cours : demain', () => {
    expect(proposeNextAction({ outcome: 'reached', missedAttempts: 0, now: NOW })).toMatchObject({
      kind: 'callback',
      stage: 'contacted',
    });
    const inProgress = proposeNextAction({ outcome: 'in_progress', missedAttempts: 0, now: NOW });
    expect(inProgress.dueAt?.toISOString()).toBe('2026-09-05T08:00:00.000Z');
  });
});
