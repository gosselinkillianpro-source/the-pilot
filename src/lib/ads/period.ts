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

/** Plage de dates explicite (YYYY-MM-DD, bornes incluses) pour comparaison & séries. */
export type DateRange = { since: string; until: string };

/** Point d'une série journalière. */
export type DailyPoint = { date: string; spend: number; clicks: number; results: number };

/** Totaux agrégés au niveau compte (pour comparaison de période). */
export type AccountTotals = {
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  results: number;
};

const DAY_MS = 86_400_000;
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Convertit une période (même préréglée) en plage de dates explicite, basée sur `now`. */
export function periodToRange(period: AdsPeriod, now: Date = new Date()): DateRange {
  if (period.kind === 'custom') return { since: period.from, until: period.to };
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (period.key) {
    case 'today':
      return { since: isoDay(now), until: isoDay(now) };
    case 'yesterday': {
      const d = new Date(now.getTime() - DAY_MS);
      return { since: isoDay(d), until: isoDay(d) };
    }
    case 'last_7d':
      return { since: isoDay(new Date(now.getTime() - 6 * DAY_MS)), until: isoDay(now) };
    case 'last_30d':
      return { since: isoDay(new Date(now.getTime() - 29 * DAY_MS)), until: isoDay(now) };
    case 'last_month': {
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0)); // dernier jour du mois précédent
      return { since: isoDay(start), until: isoDay(end) };
    }
    default: // this_month
      return { since: isoDay(new Date(Date.UTC(y, m, 1))), until: isoDay(now) };
  }
}

/** Plage précédente, de même longueur, immédiatement avant `range`. */
export function previousRange(range: DateRange): DateRange {
  const since = new Date(`${range.since}T00:00:00Z`).getTime();
  const until = new Date(`${range.until}T00:00:00Z`).getTime();
  const lengthDays = Math.round((until - since) / DAY_MS) + 1;
  const prevUntil = new Date(since - DAY_MS);
  const prevSince = new Date(prevUntil.getTime() - (lengthDays - 1) * DAY_MS);
  return { since: isoDay(prevSince), until: isoDay(prevUntil) };
}

/** Fragment Meta time_range pour l'endpoint /insights (passé en query param). */
export function metaTimeRangeValue(range: DateRange): string {
  return JSON.stringify({ since: range.since, until: range.until });
}

/** Clause GAQL BETWEEN à partir d'une plage explicite. */
export function googleBetweenClause(range: DateRange): string {
  return `segments.date BETWEEN '${range.since}' AND '${range.until}'`;
}
