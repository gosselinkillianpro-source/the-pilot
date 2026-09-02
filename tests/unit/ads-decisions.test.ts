import { describe, expect, test } from 'vitest';
import { buildConsoleAlerts, DECISION_RULES, decideCampaign, medianCpl } from '@/lib/ads/decisions';
import type { DailyPoint } from '@/lib/ads/period';

/** Règles de décision par campagne + alertes de rupture — seuils explicites. */

function day(date: string, spend: number, results: number): DailyPoint {
  return { date, spend, clicks: 0, results };
}

const flatSeries = (spendPerDay: number, resultsPerDay: number, days = 7): DailyPoint[] =>
  Array.from({ length: days }, (_, i) =>
    day(`2026-08-${String(i + 1).padStart(2, '0')}`, spendPerDay, resultsPerDay),
  );

describe('medianCpl', () => {
  test('médiane des CPL des campagnes jugeables uniquement', () => {
    const m = medianCpl([
      { spend: 100, results: 10 }, // CPL 10
      { spend: 300, results: 10 }, // CPL 30
      { spend: 200, results: 10 }, // CPL 20
      { spend: 10, results: 1 }, // < minSpend → ignorée
      { spend: 500, results: 0 }, // sans lead → ignorée
    ]);
    expect(m).toBe(20);
  });

  test('aucune campagne jugeable → null (pas de fausse référence)', () => {
    expect(medianCpl([{ spend: 5, results: 1 }])).toBeNull();
  });
});

describe('decideCampaign', () => {
  const median = 20;

  test('en pause → observer', () => {
    const d = decideCampaign({ status: 'paused', spend: 500, results: 0, series: [] }, median);
    expect(d.verdict).toBe('observer');
  });

  test('dépense insuffisante → observer, jamais un verdict hâtif', () => {
    const d = decideCampaign({ status: 'active', spend: 10, results: 0, series: [] }, median);
    expect(d.verdict).toBe('observer');
  });

  test('48 h de dépense active sans lead → couper (rupture, même si le CPL période est bon)', () => {
    const series = [...flatSeries(20, 2, 5), day('2026-08-06', 20, 0), day('2026-08-07', 20, 0)];
    const d = decideCampaign({ status: 'active', spend: 140, results: 10, series }, median);
    expect(d.verdict).toBe('couper');
    expect(d.reason).toContain('sans un seul lead');
  });

  test('0 lead sur toute la période avec vraie dépense → couper', () => {
    const d = decideCampaign(
      { status: 'active', spend: 200, results: 0, series: flatSeries(2, 0) },
      median,
    );
    expect(d.verdict).toBe('couper');
  });

  test('CPL > 2× médiane → couper ; > 1,5× → réduire ; < 0,7× avec volume → scale', () => {
    const mk = (spend: number, results: number) =>
      decideCampaign(
        { status: 'active', spend, results, series: flatSeries(spend / 7, results / 7) },
        median,
      ).verdict;
    expect(mk(500, 10)).toBe('couper'); // CPL 50 > 40
    expect(mk(350, 10)).toBe('reduire'); // CPL 35 > 30
    expect(mk(100, 10)).toBe('scale'); // CPL 10 < 14, volume 10 ≥ 5
    expect(mk(100, 4)).toBe('garder'); // CPL 25… non : 25 > 20 mais < 30 → garder
  });

  test('bon CPL mais volume insuffisant → garder, pas scale', () => {
    const d = decideCampaign(
      { status: 'active', spend: 40, results: 4, series: flatSeries(6, 1) },
      median,
    );
    expect(d.verdict).toBe('garder');
    expect(DECISION_RULES.scaleMinResults).toBeGreaterThan(4);
  });
});

describe('buildConsoleAlerts', () => {
  test('CPL compte en rupture : +30 % sur 3 jours → alerte danger', () => {
    const accountDaily = [
      ...['01', '02', '03'].map((d) => day(`2026-08-${d}`, 100, 10)), // CPL 10
      ...['04', '05', '06'].map((d) => day(`2026-08-${d}`, 100, 5)), // CPL 20 (+100 %)
    ];
    const alerts = buildConsoleAlerts({
      accountDaily,
      campaigns: [],
      seriesByCampaign: new Map(),
      rdv: { cur: { pris: 0, honores: 0 }, prev: { pris: 0, honores: 0 } },
    });
    expect(alerts.some((a) => a.title.includes('CPL en rupture'))).toBe(true);
  });

  test('campagne active qui dépense sans lead 48 h → alerte liée à la campagne', () => {
    const series = [...flatSeries(20, 1, 5), day('2026-08-06', 25, 0), day('2026-08-07', 25, 0)];
    const alerts = buildConsoleAlerts({
      accountDaily: [],
      campaigns: [{ id: 'c1', name: 'Prospection large', status: 'active' }],
      seriesByCampaign: new Map([['c1', series]]),
      rdv: { cur: { pris: 0, honores: 0 }, prev: { pris: 0, honores: 0 } },
    });
    const a = alerts.find((x) => x.campaignId === 'c1');
    expect(a).toBeDefined();
    expect(a?.level).toBe('danger');
  });

  test('taux de show en chute de plus de 20 % → alerte warning', () => {
    const alerts = buildConsoleAlerts({
      accountDaily: [],
      campaigns: [],
      seriesByCampaign: new Map(),
      rdv: { cur: { pris: 10, honores: 4 }, prev: { pris: 10, honores: 8 } },
    });
    expect(alerts.some((a) => a.title.includes('Taux de show'))).toBe(true);
  });

  test('volumes RDV trop faibles → pas de fausse alerte de show', () => {
    const alerts = buildConsoleAlerts({
      accountDaily: [],
      campaigns: [],
      seriesByCampaign: new Map(),
      rdv: { cur: { pris: 2, honores: 0 }, prev: { pris: 3, honores: 3 } },
    });
    expect(alerts).toHaveLength(0);
  });
});
