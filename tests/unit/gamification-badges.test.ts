import { describe, expect, test } from 'vitest';
import {
  BADGE_RULES,
  earnedWeeklyBadges,
  hasCallStreak,
  type WeekActivity,
} from '@/lib/closing/gamification/badges';

function activity(over: Partial<WeekActivity> = {}): WeekActivity {
  return {
    fastCallbacks: 0,
    callsByDay: {},
    subscriptions: 0,
    maxSubscriptionEur: 0,
    hasEarlyCall: false,
    ...over,
  };
}

describe('série d’appels', () => {
  test('5 jours consécutifs à 10+ appels : gagné', () => {
    const days = {
      '2026-08-24': 12,
      '2026-08-25': 10,
      '2026-08-26': 15,
      '2026-08-27': 11,
      '2026-08-28': 10,
    };
    expect(hasCallStreak(days)).toBe(true);
  });

  test('un jour sous le seuil casse la série', () => {
    const days = {
      '2026-08-24': 12,
      '2026-08-25': 10,
      '2026-08-26': 9, // raté
      '2026-08-27': 11,
      '2026-08-28': 10,
    };
    expect(hasCallStreak(days)).toBe(false);
  });

  test('un jour SANS appel au milieu casse la série (jours non consécutifs)', () => {
    const days = {
      '2026-08-24': 12,
      '2026-08-25': 10,
      // le 26 : rien
      '2026-08-27': 11,
      '2026-08-28': 10,
      '2026-08-29': 14,
    };
    expect(hasCallStreak(days)).toBe(false);
  });

  test('la série peut chevaucher un changement de mois', () => {
    const days = {
      '2026-08-28': 12,
      '2026-08-29': 10,
      '2026-08-30': 15,
      '2026-08-31': 11,
      '2026-09-01': 10,
    };
    expect(hasCallStreak(days)).toBe(true);
  });
});

describe('badges de la semaine', () => {
  test('aucune activité, aucun badge', () => {
    expect(earnedWeeklyBadges(activity())).toEqual([]);
  });

  test('un rappel < 5 min donne l’Éclair', () => {
    expect(earnedWeeklyBadges(activity({ fastCallbacks: 1 }))).toContain('eclair');
  });

  test('3 souscriptions attribuées donnent le Sniper, 2 non', () => {
    expect(earnedWeeklyBadges(activity({ subscriptions: 3 }))).toContain('sniper');
    expect(earnedWeeklyBadges(activity({ subscriptions: 2 }))).not.toContain('sniper');
  });

  test('le Gros poisson exige 50 000 € sur UNE souscription', () => {
    expect(earnedWeeklyBadges(activity({ maxSubscriptionEur: 50_000 }))).toContain('gros_poisson');
    expect(earnedWeeklyBadges(activity({ maxSubscriptionEur: 49_999 }))).not.toContain(
      'gros_poisson',
    );
  });

  test('un appel avant 9 h 30 donne le Lève-tôt', () => {
    expect(earnedWeeklyBadges(activity({ hasEarlyCall: true }))).toContain('leve_tot');
  });

  test('le Roi de la semaine ne se gagne JAMAIS par ce chemin (semaine écoulée uniquement)', () => {
    const full = activity({
      fastCallbacks: 3,
      subscriptions: 10,
      maxSubscriptionEur: 100_000,
      hasEarlyCall: true,
    });
    expect(earnedWeeklyBadges(full)).not.toContain('roi_semaine');
  });

  test('les seuils restent ceux annoncés aux closers', () => {
    expect(BADGE_RULES.SNIPER_MIN_SUBS).toBe(3);
    expect(BADGE_RULES.GROS_POISSON_MIN_EUR).toBe(50_000);
    expect(BADGE_RULES.SERIE_DAYS).toBe(5);
    expect(BADGE_RULES.SERIE_MIN_CALLS_PER_DAY).toBe(10);
  });
});
