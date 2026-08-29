/**
 * Périodes de classement — semaine / trimestre / année, en heure de Paris.
 *
 * Le classement hebdo repart de zéro chaque lundi 00 h 00 (Paris), le
 * trimestriel au trimestre civil, l'annuel au 1er janvier. Le serveur tourne
 * en UTC : toutes les bornes sont donc calculées en instant UTC correspondant
 * au minuit PARISIEN, sinon un appel passé lundi à 0 h 30 compterait encore
 * pour la semaine précédente (ou l'inverse à l'heure d'été).
 */

export type PeriodKind = 'week' | 'quarter' | 'year';

export type GamePeriod = {
  kind: PeriodKind;
  /** Borne incluse. */
  from: Date;
  /** Borne EXCLUE (début de la période suivante). */
  to: Date;
  /** Clé stable (« 2026-W35 », « 2026-Q3 », « 2026 ») — sert aux badges. */
  key: string;
  label: string;
};

type ParisDate = { year: number; month: number; day: number };

/** Décalage Paris/UTC (minutes) à un instant donné — gère heure d'été/hiver. */
function parisOffsetMinutes(at: Date): number {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'shortOffset',
  }).format(at);
  const match = formatted.match(/UTC([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) return 60; // filet : heure d'hiver française
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours * 60 + Math.sign(hours) * minutes;
}

/** Date civile (année/mois/jour) d'un instant, vue de Paris. */
function parisDateOf(at: Date): ParisDate {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(at);
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Instant UTC du minuit parisien pour une date civile donnée.
 * Deux passes : on estime le décalage sur un premier candidat, puis on le
 * revalide — nécessaire les nuits de bascule heure d'été/hiver.
 */
export function parisMidnightUTC(year: number, month: number, day: number): Date {
  let candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  for (let i = 0; i < 2; i++) {
    const offset = parisOffsetMinutes(candidate);
    candidate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset * 60_000);
  }
  return candidate;
}

/** Jour de semaine parisien (1 = lundi … 7 = dimanche). */
function parisWeekday(at: Date): number {
  const short = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  }).format(at);
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return order.indexOf(short) + 1;
}

/** Numéro de semaine ISO 8601 (celle qui contient le jeudi). */
function isoWeek(d: ParisDate): { year: number; week: number } {
  // On travaille en UTC pur : seule la date civile compte ici.
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day));
  const dayNum = (date.getUTCDay() + 6) % 7; // 0 = lundi
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const week = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return { year: isoYear, week };
}

function shiftParisDate(d: ParisDate, days: number): ParisDate {
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function currentPeriod(kind: PeriodKind, now: Date = new Date()): GamePeriod {
  const today = parisDateOf(now);

  if (kind === 'week') {
    const monday = shiftParisDate(today, -(parisWeekday(now) - 1));
    const nextMonday = shiftParisDate(monday, 7);
    const { year, week } = isoWeek(monday);
    return {
      kind,
      from: parisMidnightUTC(monday.year, monday.month, monday.day),
      to: parisMidnightUTC(nextMonday.year, nextMonday.month, nextMonday.day),
      key: `${year}-W${String(week).padStart(2, '0')}`,
      label: `Semaine ${week}`,
    };
  }

  if (kind === 'quarter') {
    const quarter = Math.floor((today.month - 1) / 3) + 1;
    const firstMonth = (quarter - 1) * 3 + 1;
    const nextFirst =
      quarter === 4
        ? { year: today.year + 1, month: 1 }
        : { year: today.year, month: firstMonth + 3 };
    return {
      kind,
      from: parisMidnightUTC(today.year, firstMonth, 1),
      to: parisMidnightUTC(nextFirst.year, nextFirst.month, 1),
      key: `${today.year}-Q${quarter}`,
      label: `T${quarter} ${today.year}`,
    };
  }

  return {
    kind,
    from: parisMidnightUTC(today.year, 1, 1),
    to: parisMidnightUTC(today.year + 1, 1, 1),
    key: String(today.year),
    label: String(today.year),
  };
}

/** Période précédente de même nature (sert au « Roi de la semaine » écoulée). */
export function previousPeriod(kind: PeriodKind, now: Date = new Date()): GamePeriod {
  const current = currentPeriod(kind, now);
  // 12 h avant le début de la période courante : tombe forcément dans la précédente.
  return currentPeriod(kind, new Date(current.from.getTime() - 12 * 3_600_000));
}
