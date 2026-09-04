import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SERVICE_HOURS,
  effectiveServiceMinutes,
  isWithinServiceHours,
  nextDayAt,
  nextServiceOpening,
  weekMonday,
  zonedParts,
  zonedTimeToUtc,
} from '@/lib/domain/time';

// Septembre 2026 : heure d'été (UTC+2). Janvier : heure d'hiver (UTC+1).
const paris = (y: number, m: number, d: number, h: number, mi = 0) =>
  zonedTimeToUtc({ year: y, month: m, day: d, hour: h, minute: mi });

describe('zonedTimeToUtc / zonedParts', () => {
  test('convertit une heure murale de Paris en instant UTC (été)', () => {
    expect(paris(2026, 9, 4, 10).toISOString()).toBe('2026-09-04T08:00:00.000Z');
  });
  test('convertit en hiver', () => {
    expect(paris(2026, 1, 15, 10).toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });
  test('retrouve les parties locales et le jour ISO', () => {
    const p = zonedParts(new Date('2026-09-05T21:30:00Z')); // samedi 23:30 Paris
    expect(p).toMatchObject({ year: 2026, month: 9, day: 5, hour: 23, minute: 30, isoWeekday: 6 });
  });
});

describe('isWithinServiceHours', () => {
  test('ouvert un vendredi 9 h 30', () => {
    expect(isWithinServiceHours(paris(2026, 9, 4, 9, 30), DEFAULT_SERVICE_HOURS)).toBe(true);
  });
  test('fermé un vendredi 20 h 00 (borne exclue) et le dimanche', () => {
    expect(isWithinServiceHours(paris(2026, 9, 4, 20), DEFAULT_SERVICE_HOURS)).toBe(false);
    expect(isWithinServiceHours(paris(2026, 9, 6, 12), DEFAULT_SERVICE_HOURS)).toBe(false);
  });
});

describe('nextServiceOpening', () => {
  test('renvoie l’instant lui-même quand le service est ouvert', () => {
    const t = paris(2026, 9, 4, 11);
    expect(nextServiceOpening(t, DEFAULT_SERVICE_HOURS)).toEqual(t);
  });
  test('un samedi 22 h ouvre le lundi 9 h', () => {
    const t = paris(2026, 9, 5, 22);
    expect(nextServiceOpening(t, DEFAULT_SERVICE_HOURS)).toEqual(paris(2026, 9, 7, 9));
  });
  test('un mardi 7 h ouvre le mardi 9 h', () => {
    expect(nextServiceOpening(paris(2026, 9, 8, 7), DEFAULT_SERVICE_HOURS)).toEqual(
      paris(2026, 9, 8, 9),
    );
  });
  test('aucune plage configurée : null', () => {
    expect(nextServiceOpening(paris(2026, 9, 8, 7), {})).toBeNull();
  });
});

describe('effectiveServiceMinutes', () => {
  test('dans la même plage : minutes réelles', () => {
    expect(
      effectiveServiceMinutes(
        paris(2026, 9, 4, 10),
        paris(2026, 9, 4, 10, 7),
        DEFAULT_SERVICE_HOURS,
      ),
    ).toBe(7);
  });
  test('reçu samedi 22 h, rappelé lundi 9 h 03 : 3 minutes', () => {
    expect(
      effectiveServiceMinutes(
        paris(2026, 9, 5, 22),
        paris(2026, 9, 7, 9, 3),
        DEFAULT_SERVICE_HOURS,
      ),
    ).toBe(3);
  });
  test('à cheval sur une fermeture : 19 h 50 → 9 h 05 le lendemain = 15 min', () => {
    expect(
      effectiveServiceMinutes(
        paris(2026, 9, 3, 19, 50),
        paris(2026, 9, 4, 9, 5),
        DEFAULT_SERVICE_HOURS,
      ),
    ).toBe(15);
  });
  test('ordre inversé : 0', () => {
    expect(
      effectiveServiceMinutes(paris(2026, 9, 4, 10), paris(2026, 9, 4, 9), DEFAULT_SERVICE_HOURS),
    ).toBe(0);
  });
});

describe('nextDayAt / weekMonday', () => {
  test('lendemain 10 h heure de Paris', () => {
    expect(nextDayAt(paris(2026, 9, 4, 18, 45), '10:00')).toEqual(paris(2026, 9, 5, 10));
  });
  test('lundi de la semaine', () => {
    expect(weekMonday(paris(2026, 9, 4, 18))).toEqual(paris(2026, 8, 31, 0));
    expect(weekMonday(paris(2026, 9, 6, 23))).toEqual(paris(2026, 8, 31, 0));
  });
});
