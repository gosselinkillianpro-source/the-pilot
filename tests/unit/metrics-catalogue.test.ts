import { describe, expect, it } from 'vitest';
import { ALL_METRICS, getMetric, METRICS, type SourceKey } from '@/lib/metrics/catalogue';

const VALID_SOURCES: SourceKey[] = ['sah_db', 'brevo', 'meta_ads', 'google_ads', 'derived'];
const VALID_UNITS = ['eur', 'count', 'pct', 'days', 'ratio', 'text'];

describe('Catalogue de métriques — test de lignée', () => {
  it('expose un catalogue non vide', () => {
    expect(ALL_METRICS.length).toBeGreaterThanOrEqual(20);
  });

  // Règle de lignée : une métrique ne peut exister sans définition, source ET calcul.
  it('chaque métrique a definition + sourceDetail + calcul + decision non vides', () => {
    for (const m of ALL_METRICS) {
      expect(m.definition.trim().length, `definition manquante : ${m.id}`).toBeGreaterThan(0);
      expect(m.sourceDetail.trim().length, `sourceDetail manquant : ${m.id}`).toBeGreaterThan(0);
      expect(m.calcul.trim().length, `calcul manquant : ${m.id}`).toBeGreaterThan(0);
      expect(m.decision.trim().length, `decision manquante : ${m.id}`).toBeGreaterThan(0);
      expect(m.label.trim().length, `label manquant : ${m.id}`).toBeGreaterThan(0);
    }
  });

  it('chaque source est canonique et chaque unité valide', () => {
    for (const m of ALL_METRICS) {
      expect(VALID_SOURCES, `source invalide : ${m.id}`).toContain(m.source);
      expect(VALID_UNITS, `unité invalide : ${m.id}`).toContain(m.unit);
    }
  });

  it('les identifiants sont uniques', () => {
    const ids = ALL_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getMetric et METRICS retrouvent chaque définition par id', () => {
    for (const m of ALL_METRICS) {
      expect(getMetric(m.id)).toBe(m);
      expect(METRICS[m.id]).toBe(m);
    }
    expect(getMetric('id-inexistant')).toBeUndefined();
  });
});
