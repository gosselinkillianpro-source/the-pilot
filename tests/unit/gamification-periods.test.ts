import { describe, expect, test } from 'vitest';
import {
  currentPeriod,
  parisMidnightUTC,
  previousPeriod,
} from '@/lib/closing/gamification/periods';

/** Samedi 29 août 2026, 16 h heure de Paris (été : UTC+2). */
const SAMEDI = new Date('2026-08-29T14:00:00Z');

describe('minuit parisien', () => {
  test("en été, minuit à Paris c'est 22 h UTC la veille", () => {
    expect(parisMidnightUTC(2026, 8, 24).toISOString()).toBe('2026-08-23T22:00:00.000Z');
  });
  test("en hiver, c'est 23 h UTC la veille", () => {
    expect(parisMidnightUTC(2026, 1, 15).toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });
});

describe('semaine', () => {
  test('la semaine démarre le lundi 00 h 00 heure de Paris', () => {
    const week = currentPeriod('week', SAMEDI);
    // Lundi 24 août 2026, minuit Paris = dimanche 23, 22 h UTC.
    expect(week.from.toISOString()).toBe('2026-08-23T22:00:00.000Z');
    expect(week.to.toISOString()).toBe('2026-08-30T22:00:00.000Z');
    expect(week.key).toBe('2026-W35');
    expect(week.label).toBe('Semaine 35');
  });

  test('lundi 00 h 30 heure de Paris appartient à la NOUVELLE semaine', () => {
    // Lundi 31 août 2026, 00 h 30 Paris = dimanche 30 août 22 h 30 UTC.
    const lundiToutJuste = new Date('2026-08-30T22:30:00Z');
    expect(currentPeriod('week', lundiToutJuste).key).toBe('2026-W36');
  });

  test('la semaine précédente est bien la semaine d’avant', () => {
    expect(previousPeriod('week', SAMEDI).key).toBe('2026-W34');
  });
});

describe('trimestre et année', () => {
  test('le 29 août tombe au T3', () => {
    const q = currentPeriod('quarter', SAMEDI);
    expect(q.key).toBe('2026-Q3');
    expect(q.from.toISOString()).toBe('2026-06-30T22:00:00.000Z'); // 1er juillet minuit Paris
    expect(q.to.toISOString()).toBe('2026-09-30T22:00:00.000Z'); // 1er octobre minuit Paris
  });

  test('le T4 déborde proprement sur l’année suivante', () => {
    const q = currentPeriod('quarter', new Date('2026-11-15T10:00:00Z'));
    expect(q.key).toBe('2026-Q4');
    expect(q.to.toISOString()).toBe('2026-12-31T23:00:00.000Z'); // 1er janvier 2027 minuit Paris (hiver)
  });

  test("l'année civile, bornée aux minuits parisiens", () => {
    const y = currentPeriod('year', SAMEDI);
    expect(y.key).toBe('2026');
    expect(y.from.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(y.to.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});
