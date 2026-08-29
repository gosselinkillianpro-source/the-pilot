import { describe, expect, test } from 'vitest';
import { isNightSignup } from '@/lib/leads/night-leads';

describe('inscrit de la nuit', () => {
  test('20 h 01 heure de Paris : la nuit commence', () => {
    // Été : 18 h 01 UTC = 20 h 01 Paris.
    expect(isNightSignup(new Date('2026-08-28T18:01:00Z'))).toBe(true);
  });

  test('19 h 59 heure de Paris : encore le jour', () => {
    expect(isNightSignup(new Date('2026-08-28T17:59:00Z'))).toBe(false);
  });

  test('3 h du matin : la nuit, évidemment', () => {
    expect(isNightSignup(new Date('2026-08-29T01:00:00Z'))).toBe(true);
  });

  test('8 h 59 : toujours la nuit calme, 9 h 00 : le jour reprend', () => {
    // Été : 6 h 59 UTC = 8 h 59 Paris ; 7 h 00 UTC = 9 h 00 Paris.
    expect(isNightSignup(new Date('2026-08-29T06:59:00Z'))).toBe(true);
    expect(isNightSignup(new Date('2026-08-29T07:00:00Z'))).toBe(false);
  });

  test("en hiver, c'est bien l'heure de Paris qui décide (UTC+1)", () => {
    // 19 h 30 UTC = 20 h 30 Paris en janvier → nuit.
    expect(isNightSignup(new Date('2026-01-15T19:30:00Z'))).toBe(true);
    // 18 h 30 UTC = 19 h 30 Paris en hiver → jour (l'été, la même heure UTC serait la nuit).
    expect(isNightSignup(new Date('2026-01-15T18:30:00Z'))).toBe(false);
  });
});
