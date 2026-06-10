/**
 * Période d'analyse pour les Ads. On s'aligne sur les préréglages NATIFS
 * de Meta (date_preset) et Google Ads (GAQL DURING), plus une plage
 * personnalisée (from/to) traduite en time_range / BETWEEN.
 */

export const ADS_PERIODS = [
  { key: 'today', label: "Aujourd'hui", meta: 'today', google: 'TODAY' },
  { key: 'yesterday', label: 'Hier', meta: 'yesterday', google: 'YESTERDAY' },
  { key: 'last_7d', label: '7 jours', meta: 'last_7d', google: 'LAST_7_DAYS' },
  { key: 'last_30d', label: '30 jours', meta: 'last_30d', google: 'LAST_30_DAYS' },
  { key: 'this_month', label: 'Ce mois', meta: 'this_month', google: 'THIS_MONTH' },
  { key: 'last_month', label: 'Mois dernier', meta: 'last_month', google: 'LAST_MONTH' },
] as const;

export type AdsPeriodKey = (typeof ADS_PERIODS)[number]['key'];

const DEFAULT_KEY: AdsPeriodKey = 'this_month';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AdsPeriod =
  | { kind: 'preset'; key: AdsPeriodKey; label: string; meta: string; google: string }
  | { kind: 'custom'; from: string; to: string; label: string };

/** Résout la période depuis les searchParams (?period= ou ?from=&to=). */
export function resolveAdsPeriod(sp: { period?: string; from?: string; to?: string }): AdsPeriod {
  if (sp.from && sp.to && ISO_DATE.test(sp.from) && ISO_DATE.test(sp.to) && sp.to >= sp.from) {
    return { kind: 'custom', from: sp.from, to: sp.to, label: `${sp.from} → ${sp.to}` };
  }
  const preset =
    ADS_PERIODS.find((p) => p.key === sp.period) ?? ADS_PERIODS.find((p) => p.key === DEFAULT_KEY);
  const p = preset ?? ADS_PERIODS[4];
  return { kind: 'preset', key: p.key, label: p.label, meta: p.meta, google: p.google };
}

/** Fragment d'insights Meta : date_preset(...) ou time_range({...}). */
export function metaInsightsRange(period: AdsPeriod): string {
  if (period.kind === 'custom') {
    return `time_range({"since":"${period.from}","until":"${period.to}"})`;
  }
  return `date_preset(${period.meta})`;
}

/** Clause WHERE de date pour GAQL : DURING <ENUM> ou BETWEEN '...' AND '...'. */
export function googleDateClause(period: AdsPeriod): string {
  if (period.kind === 'custom') {
    return `segments.date BETWEEN '${period.from}' AND '${period.to}'`;
  }
  return `segments.date DURING ${period.google}`;
}
