import { describe, expect, it } from 'vitest';
import { type ConsistencySnapshot, runGuardrails, safeRatio } from '@/lib/metrics/guardrails';

// Jeu de données de RÉFÉRENCE figé (cohérent).
const COHERENT: ConsistencySnapshot = {
  collecteTotale: 100_000,
  collecteParProjet: [60_000, 40_000],
  investisseursTotal: 200,
  investisseursAyantInvesti: 53,
  funnel: [
    { label: 'Inscrits', value: 200 },
    { label: 'Profil complété', value: 150 },
    { label: 'Onboardés (KYC)', value: 100 },
    { label: 'Ont investi', value: 53 },
  ],
  ratios: [
    {
      numerator: 100_000,
      denominator: 53,
      label: 'Ticket moyen',
      metricId: 'ticket_moyen_investisseur',
    },
  ],
};

describe('Garde-fous — jeu de référence cohérent', () => {
  it('ne lève aucune incohérence', () => {
    const r = runGuardrails(COHERENT);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.suspect.size).toBe(0);
  });
});

describe('Garde-fous — détection des incohérences', () => {
  it('somme par projet ≠ total → alerte (warn)', () => {
    const r = runGuardrails({ ...COHERENT, collecteParProjet: [60_000, 30_000] });
    expect(r.issues.some((i) => i.id === 'collecte-par-projet')).toBe(true);
    expect(r.suspect.has('collecte_totale')).toBe(true);
  });

  it('« ont investi » > base totale → erreur (ok=false)', () => {
    const r = runGuardrails({ ...COHERENT, investisseursAyantInvesti: 250 });
    expect(r.ok).toBe(false);
    expect(r.suspect.has('investisseurs_ayant_investi')).toBe(true);
  });

  it('funnel non monotone → erreur', () => {
    const r = runGuardrails({
      ...COHERENT,
      funnel: [
        { label: 'A', value: 100 },
        { label: 'B', value: 120 },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('valeur négative → erreur', () => {
    const r = runGuardrails({ ...COHERENT, collecteTotale: -5 });
    expect(r.ok).toBe(false);
  });

  it('dénominateur de ratio nul → métrique marquée à vérifier (pas de moyenne sur 0)', () => {
    const r = runGuardrails({
      ...COHERENT,
      ratios: [
        {
          numerator: 1000,
          denominator: 0,
          label: 'Ticket moyen',
          metricId: 'ticket_moyen_investisseur',
        },
      ],
    });
    expect(r.suspect.has('ticket_moyen_investisseur')).toBe(true);
  });
});

describe('safeRatio — jamais de moyenne sur 0', () => {
  it('null si dénominateur nul', () => expect(safeRatio(100, 0)).toBeNull());
  it('null si dénominateur négatif', () => expect(safeRatio(100, -1)).toBeNull());
  it('null si non fini', () => expect(safeRatio(Number.NaN, 4)).toBeNull());
  it('calcule sinon', () => expect(safeRatio(100, 4)).toBe(25));
});
