import { describe, expect, test } from 'vitest';
import type { BuyerCriteria } from '@/lib/db/schema';
import { evaluateBuyerCriteria, qualifyForBuyer, unionCriteria } from '@/lib/domain/criteria';

const criteria: BuyerCriteria = {
  montant_min: '10k-50k',
  objectifs: ['impots', 'retraite', 'fructifier'],
  timing_max: 'annee',
  impot_min: '2500-5000',
  exclusions: { statut_pro: ['retraite'] },
  obligatoires: ['montant_min', 'timing_max'],
};

describe('evaluateBuyerCriteria', () => {
  test('évalue automatiquement chaque critère configuré', () => {
    const result = evaluateBuyerCriteria(criteria, {
      montant: '50k-100k',
      objectif: 'impots',
      urgence: '3mois',
      impot_annuel: 'moins-2500',
      statut_pro: 'salarie',
    });
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.auto]));
    expect(byKey).toEqual({
      montant_min: true,
      objectifs: true,
      timing_max: true,
      impot_min: false,
      exclusions: true,
    });
    expect(result.find((r) => r.key === 'montant_min')?.mandatory).toBe(true);
    expect(result.find((r) => r.key === 'objectifs')?.mandatory).toBe(false);
  });
  test('réponse absente ou inconnue : non vérifié (null)', () => {
    const result = evaluateBuyerCriteria(criteria, {
      montant: 'moins-10k',
      impot_annuel: 'inconnu',
    });
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.auto]));
    expect(byKey.montant_min).toBe(false);
    expect(byKey.timing_max).toBeNull();
    expect(byKey.impot_min).toBeNull();
    expect(byKey.exclusions).toBeNull();
  });
  test('exclusion déclenchée', () => {
    const result = evaluateBuyerCriteria(criteria, { statut_pro: 'retraite' });
    expect(result.find((r) => r.key === 'exclusions')?.auto).toBe(false);
  });
  test('curiosité dépasse un timing max « annee »', () => {
    const result = evaluateBuyerCriteria(criteria, { urgence: 'curiosite' });
    expect(result.find((r) => r.key === 'timing_max')?.auto).toBe(false);
  });
});

describe('qualifyForBuyer', () => {
  test('qualifié quand tous les obligatoires sont oui', () => {
    const q = qualifyForBuyer('b1', criteria, { montant: '10k-50k', urgence: 'maintenant' }, {});
    expect(q.qualified).toBe(true);
    expect(q.score).toBe(2);
    expect(q.mandatoryTotal).toBe(2);
  });
  test('aucun critère obligatoire : toujours qualifié', () => {
    const q = qualifyForBuyer('b1', { obligatoires: [] }, {}, {});
    expect(q.qualified).toBe(true);
    expect(q.mandatoryTotal).toBe(0);
  });
  test('non qualifié si un obligatoire est non vérifié', () => {
    const q = qualifyForBuyer('b1', criteria, { montant: '10k-50k' }, {});
    expect(q.qualified).toBe(false);
    expect(q.score).toBe(1);
  });
  test('le setter peut confirmer un critère non vérifié, ou contredire l’automatique', () => {
    expect(
      qualifyForBuyer('b1', criteria, { montant: '10k-50k' }, { timing_max: true }).qualified,
    ).toBe(true);
    expect(
      qualifyForBuyer(
        'b1',
        criteria,
        { montant: '10k-50k', urgence: 'maintenant' },
        { montant_min: false },
      ).qualified,
    ).toBe(false);
  });
});

describe('unionCriteria', () => {
  test('fusionne les critères de plusieurs acheteurs, un « non » l’emporte', () => {
    const b2: BuyerCriteria = { montant_min: '100k-250k', obligatoires: ['montant_min'] };
    const union = unionCriteria(
      [
        { id: 'a', name: 'Cabinet A', criteria },
        { id: 'b', name: 'Cabinet B', criteria: b2 },
      ],
      { montant: '50k-100k', urgence: 'annee' },
    );
    const montant = union.find((u) => u.key === 'montant_min');
    expect(montant?.auto).toBe(false);
    expect(montant?.mandatoryFor).toEqual(['Cabinet A', 'Cabinet B']);
    expect(union.map((u) => u.key)).toContain('timing_max');
  });
});
