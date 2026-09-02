import { describe, expect, test } from 'vitest';
import { buildFunnel, type FunnelInput } from '@/lib/ads/funnel-math';

/** Funnel de la console Ads : taux, coûts unitaires, étape la plus dégradée. */

const FULL: FunnelInput = {
  impressions: 100_000,
  clicks: 2_000,
  leads: 100,
  rdvPris: 40,
  rdvHonores: 30,
  closes: 5,
  revenue: 50_000,
};

describe('buildFunnel', () => {
  test('taux et coûts unitaires sur un funnel complet', () => {
    const { steps } = buildFunnel(FULL, FULL, 1_000);
    const byKey = new Map(steps.map((s) => [s.key, s]));

    expect(byKey.get('clicks')?.conv).toBe(2); // 2000/100000
    expect(byKey.get('leads')?.conv).toBe(5); // 100/2000
    expect(byKey.get('leads')?.unitCost).toBe(10); // CPL = 1000/100
    expect(byKey.get('rdvPris')?.unitCost).toBe(25); // 1000/40
    expect(byKey.get('closes')?.unitCost).toBe(200); // CAC = 1000/5
    expect(byKey.get('revenue')?.conv).toBeNull(); // une étape en € n'a pas de « taux »
  });

  test('étape non trackée : null affichable, la chaîne saute le trou sans casser', () => {
    const cur = { ...FULL, rdvPris: null, rdvHonores: null };
    const { steps } = buildFunnel(cur, cur, 1_000);
    const byKey = new Map(steps.map((s) => [s.key, s]));

    expect(byKey.get('rdvPris')?.value).toBeNull();
    expect(byKey.get('rdvPris')?.conv).toBeNull();
    // closes se compare alors à la dernière étape trackée (leads), pas au trou.
    expect(byKey.get('closes')?.conv).toBe(5); // 5/100
  });

  test("l'étape la plus dégradée vs période précédente est identifiée", () => {
    const prev = { ...FULL };
    // Le taux clics→leads s'effondre (5 % → 1 %), le reste bouge peu.
    const cur = { ...FULL, leads: 20, closes: 5, revenue: 50_000 };
    const { worstKey } = buildFunnel(cur, prev, 1_000);
    expect(worstKey).toBe('leads');
  });

  test('pas de fausse dégradation quand la période précédente est vide', () => {
    const empty: FunnelInput = {
      impressions: null,
      clicks: null,
      leads: 0,
      rdvPris: 0,
      rdvHonores: 0,
      closes: 0,
      revenue: 0,
    };
    const { worstKey } = buildFunnel(FULL, empty, 1_000);
    expect(worstKey).toBeNull();
  });

  test('funnel non monotone assumé : taux > 100 % restitué tel quel', () => {
    const cur = { ...FULL, leads: 10, rdvPris: 25 }; // plus de RDV que de leads
    const { steps } = buildFunnel(cur, cur, 0);
    const rdv = steps.find((s) => s.key === 'rdvPris');
    expect(rdv?.conv).toBe(250);
  });
});
