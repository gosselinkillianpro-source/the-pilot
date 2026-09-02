import { describe, expect, test } from 'vitest';
import { assembleBlended, compute, sumCounts } from '@/lib/ads/blended-math';
import type { AcquisitionCounts } from '@/lib/db/queries/ads-acquisition';

/**
 * Assemblage du coût réel d'acquisition : dépense par régie + comptages attribués
 * (codes Meta/Google + bucket « RDV Calendly + manuels ») → lignes affichables.
 */

const LABELS = { Meta: 'SEVEN-BREACH', Google: 'BREACH-VIP' } as const;
const ZERO: AcquisitionCounts = { inscrits: 0, complets: 0, investisseurs: 0, collecte: 0 };

function counts(partial: Partial<AcquisitionCounts>): AcquisitionCounts {
  return { ...ZERO, ...partial };
}

describe('compute', () => {
  test('calcule les coûts quand il y a de la dépense', () => {
    const m = compute(
      1000,
      counts({ inscrits: 50, complets: 20, investisseurs: 4, collecte: 40000 }),
    );
    expect(m.cpa).toBe(20); // 1000 / 50
    expect(m.cpi).toBe(50); // 1000 / 20
    expect(m.costPerInvestor).toBe(250); // 1000 / 4
    expect(m.avgTicket).toBe(10000); // 40000 / 4
    expect(m.profitRatio).toBe(40); // 10000 / 250
  });

  test('sans dépense, les coûts sont null mais le ticket moyen reste réel', () => {
    const m = compute(0, counts({ inscrits: 10, investisseurs: 2, collecte: 30000 }));
    expect(m.cpa).toBeNull();
    expect(m.cpi).toBeNull();
    expect(m.costPerInvestor).toBeNull();
    expect(m.profitRatio).toBeNull();
    expect(m.avgTicket).toBe(15000);
  });

  test('division par zéro impossible : comptages à zéro → null, pas Infinity', () => {
    const m = compute(500, ZERO);
    expect(m.cpa).toBeNull();
    expect(m.costPerInvestor).toBeNull();
    expect(m.avgTicket).toBeNull();
  });
});

describe('assembleBlended', () => {
  test('une régie avec dépense + bucket RDV/manuel → 2 lignes et un total qui fusionne', () => {
    const meta = counts({ inscrits: 100, complets: 40, investisseurs: 5, collecte: 50000 });
    const extra = counts({ inscrits: 8, complets: 6, investisseurs: 2, collecte: 40000 });
    const b = assembleBlended({ Meta: 2000 }, { Meta: meta, Google: ZERO }, extra, LABELS);

    expect(b.available).toBe(true);
    expect(b.platforms).toHaveLength(1);
    expect(b.platforms[0]?.platform).toBe('Meta');

    // La ligne RDV/manuel existe, sans coût propre (pas de dépense dédiée).
    expect(b.extra).not.toBeNull();
    expect(b.extra?.metrics.cpa).toBeNull();
    expect(b.extra?.metrics.avgTicket).toBe(20000);

    // Le total divise TOUTE la dépense par TOUT l'attribué (codes + RDV/manuel).
    expect(b.total).not.toBeNull();
    expect(b.total?.spend).toBe(2000);
    expect(b.total?.counts.investisseurs).toBe(7);
    expect(b.total?.counts.collecte).toBe(90000);
    expect(b.total?.metrics.costPerInvestor).toBeCloseTo(2000 / 7);
  });

  test('régie sans dépense : pas de ligne, mais ses comptages restent dans « attributed »', () => {
    const google = counts({ inscrits: 12, investisseurs: 1, collecte: 10000 });
    const b = assembleBlended({ Meta: 0 }, { Meta: ZERO, Google: google }, ZERO, LABELS);

    expect(b.platforms).toHaveLength(0);
    expect(b.total).toBeNull();
    // Le héros « investissements issus des ads » doit compter ces gens quand même.
    expect(b.attributed.collecte).toBe(10000);
    expect(b.attributed.investisseurs).toBe(1);
  });

  test('bucket RDV/manuel vide → pas de ligne extra, pas de faux total', () => {
    const meta = counts({ inscrits: 10 });
    const b = assembleBlended({ Meta: 500 }, { Meta: meta, Google: ZERO }, ZERO, LABELS);
    expect(b.extra).toBeNull();
    expect(b.total?.counts.inscrits).toBe(10);
  });

  test('rien du tout → indisponible', () => {
    const b = assembleBlended({}, { Meta: ZERO, Google: ZERO }, ZERO, LABELS);
    expect(b.available).toBe(false);
    expect(b.attributed).toEqual(ZERO);
  });

  test('attributed = somme codes (même sans dépense) + RDV/manuel', () => {
    const meta = counts({ collecte: 1000, investisseurs: 1 });
    const google = counts({ collecte: 2000, investisseurs: 1 });
    const extra = counts({ collecte: 4000, investisseurs: 1 });
    const b = assembleBlended({ Meta: 100 }, { Meta: meta, Google: google }, extra, LABELS);
    expect(b.attributed.collecte).toBe(7000);
    expect(b.attributed.investisseurs).toBe(3);
  });
});

describe('sumCounts', () => {
  test('additionne champ à champ sans muter les entrées', () => {
    const a = counts({ inscrits: 1, collecte: 100 });
    const b = counts({ inscrits: 2, collecte: 200 });
    expect(sumCounts(a, b)).toEqual(counts({ inscrits: 3, collecte: 300 }));
    expect(a.inscrits).toBe(1);
  });
});
