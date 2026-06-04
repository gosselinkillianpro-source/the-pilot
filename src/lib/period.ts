/**
 * Période d'analyse partagée par les pages statistiques.
 * Préréglages (2 sem. / 1 / 3 / 6 / 12 mois) OU plage personnalisée (from/to).
 * Calcule aussi la période PRÉCÉDENTE équivalente (pour le gain/perte de référence).
 */

export const PERIOD_PRESETS = [
  { key: '2w', label: '2 sem.', days: 14 },
  { key: '1m', label: '1 mois', days: 30 },
  { key: '3m', label: '3 mois', days: 90 },
  { key: '6m', label: '6 mois', days: 180 },
  { key: '12m', label: '12 mois', days: 365 },
] as const;

const DAY = 86_400_000;
const DEFAULT = { key: '1m', label: '1 mois', days: 30 };

export type ResolvedPeriod = {
  fromISO: string;
  toISO: string;
  prevFromISO: string;
  prevToISO: string;
  days: number;
  label: string;
  custom: boolean;
};

export function resolvePeriod(
  sp: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedPeriod {
  // Plage personnalisée (deux dates valides)
  if (sp.from && sp.to) {
    const from = new Date(sp.from);
    const to = new Date(`${sp.to}T23:59:59`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to >= from) {
      const len = Math.max(DAY, to.getTime() - from.getTime());
      return {
        fromISO: from.toISOString(),
        toISO: to.toISOString(),
        prevFromISO: new Date(from.getTime() - len).toISOString(),
        prevToISO: from.toISOString(),
        days: Math.round(len / DAY),
        label: `${sp.from} → ${sp.to}`,
        custom: true,
      };
    }
  }
  // Préréglage
  const preset = PERIOD_PRESETS.find((p) => p.key === sp.period) ?? DEFAULT;
  const days = preset.days;
  const from = new Date(now.getTime() - days * DAY);
  return {
    fromISO: from.toISOString(),
    toISO: now.toISOString(),
    prevFromISO: new Date(now.getTime() - 2 * days * DAY).toISOString(),
    prevToISO: from.toISOString(),
    days,
    label: preset.label,
    custom: false,
  };
}

export type Delta = {
  current: number;
  previous: number;
  deltaPct: number | null;
  deltaAbs: number;
};

/** Gain/perte vs période précédente (absolu + %). deltaPct null si base nulle. */
export function delta(current: number, previous: number): Delta {
  return {
    current,
    previous,
    deltaAbs: current - previous,
    deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}
