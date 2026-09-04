import { describe, expect, test } from 'vitest';
import { MAX_ATTEMPTS, planNextAttempt } from '@/lib/domain/attempts';
import { DEFAULT_SERVICE_HOURS, zonedTimeToUtc } from '@/lib/domain/time';

const paris = (y: number, m: number, d: number, h: number, mi = 0) =>
  zonedTimeToUtc({ year: y, month: m, day: d, hour: h, minute: mi });

describe('planNextAttempt', () => {
  test('première tentative manquée : +30 min', () => {
    const plan = planNextAttempt(0, paris(2026, 9, 4, 10), DEFAULT_SERVICE_HOURS);
    expect(plan).toMatchObject({ outcome: 'retry', attemptsCount: 1, sendSlotSms: false });
    if (plan.outcome === 'retry') expect(plan.nextAttemptAt).toEqual(paris(2026, 9, 4, 10, 30));
  });
  test('deuxième manquée : +3 h et SMS de créneau', () => {
    const plan = planNextAttempt(1, paris(2026, 9, 4, 10), DEFAULT_SERVICE_HOURS);
    expect(plan).toMatchObject({ outcome: 'retry', attemptsCount: 2, sendSlotSms: true });
    if (plan.outcome === 'retry') expect(plan.nextAttemptAt).toEqual(paris(2026, 9, 4, 13));
  });
  test('troisième manquée : lendemain 10 h', () => {
    const plan = planNextAttempt(2, paris(2026, 9, 4, 16), DEFAULT_SERVICE_HOURS);
    if (plan.outcome === 'retry') expect(plan.nextAttemptAt).toEqual(paris(2026, 9, 5, 10));
    else throw new Error('attendu retry');
  });
  test('relance qui tomberait hors service : reportée à l’ouverture', () => {
    const plan = planNextAttempt(0, paris(2026, 9, 4, 19, 45), DEFAULT_SERVICE_HOURS);
    if (plan.outcome === 'retry') expect(plan.nextAttemptAt).toEqual(paris(2026, 9, 5, 9));
    else throw new Error('attendu retry');
  });
  test('dernière tentative : injoignable', () => {
    expect(planNextAttempt(MAX_ATTEMPTS - 1, paris(2026, 9, 4, 10), DEFAULT_SERVICE_HOURS)).toEqual(
      {
        outcome: 'unreachable',
        attemptsCount: MAX_ATTEMPTS,
      },
    );
  });
});
