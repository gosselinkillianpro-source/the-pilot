import { describe, expect, test } from 'vitest';
import {
  computeXp,
  LEVELS,
  levelFor,
  XP_RULES,
  type XpInputs,
} from '@/lib/closing/gamification/xp';

function stats(over: Partial<XpInputs> = {}): XpInputs {
  return {
    calls: 0,
    reached: 0,
    meetingsBooked: 0,
    registrations: 0,
    kycs: 0,
    subscriptions: 0,
    amountEur: 0,
    fastCallbacks: 0,
    ...over,
  };
}

describe('barème XP', () => {
  test('zéro activité = zéro XP', () => {
    expect(computeXp(stats())).toBe(0);
  });

  test('un appel passé vaut 10, un appel joint 25 (10 + 15 de bonus)', () => {
    expect(computeXp(stats({ calls: 1 }))).toBe(10);
    expect(computeXp(stats({ calls: 1, reached: 1 }))).toBe(25);
  });

  test('le barème validé par Killian : appel 10 / joint 25 / RDV 50 / inscription 100 / souscription 300', () => {
    expect(XP_RULES.CALL).toBe(10);
    expect(XP_RULES.CALL + XP_RULES.REACHED_BONUS).toBe(25);
    expect(XP_RULES.MEETING_BOOKED).toBe(50);
    expect(XP_RULES.KYC_COMPLETED).toBe(100);
    expect(XP_RULES.SUBSCRIPTION).toBe(300);
    expect(XP_RULES.FAST_CALLBACK).toBe(50);
  });

  test("l'argent collecté rapporte 1 XP par tranche de 100 € (arrondi bas)", () => {
    expect(computeXp(stats({ amountEur: 99 }))).toBe(0);
    expect(computeXp(stats({ amountEur: 100 }))).toBe(1);
    expect(computeXp(stats({ amountEur: 25_050 }))).toBe(250);
    // Un montant négatif (donnée corrompue) ne retire jamais d'XP.
    expect(computeXp(stats({ amountEur: -500 }))).toBe(0);
  });

  test('une semaine réaliste se cumule correctement', () => {
    // 40 appels dont 15 joints, 2 RDV, 1 inscription finalisée,
    // 1 souscription de 20 000 €, 1 rappel éclair.
    const xp = computeXp(
      stats({
        calls: 40,
        reached: 15,
        meetingsBooked: 2,
        kycs: 1,
        subscriptions: 1,
        amountEur: 20_000,
        fastCallbacks: 1,
      }),
    );
    expect(xp).toBe(40 * 10 + 15 * 15 + 2 * 50 + 100 + 300 + 200 + 50);
  });
});

describe('niveaux', () => {
  test('les niveaux commencent à Rookie et finissent à Légende', () => {
    expect(levelFor(0).name).toBe('Rookie');
    expect(levelFor(-10).name).toBe('Rookie'); // jamais de niveau négatif
    expect(levelFor(999_999).name).toBe('Légende');
  });

  test('le passage de niveau se fait exactement au plancher', () => {
    const secondFloor = LEVELS[1].floor;
    expect(levelFor(secondFloor - 1).index).toBe(0);
    expect(levelFor(secondFloor).index).toBe(1);
  });

  test('la progression vers le niveau suivant est bornée 0–100', () => {
    expect(levelFor(0).progressPct).toBe(0);
    expect(levelFor(LEVELS[1].floor - 1).progressPct).toBeLessThanOrEqual(100);
    // Dernier niveau : plus rien à viser, la barre est pleine.
    const top = levelFor(LEVELS[LEVELS.length - 1].floor);
    expect(top.next).toBeNull();
    expect(top.progressPct).toBe(100);
  });
});
