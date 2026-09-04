import type { ServiceHours, ServiceHoursDay } from '@/lib/db/schema';

/**
 * Temps : tout est stocké en UTC, tout est affiché et raisonné en heure de
 * Paris. Aucun calcul ne dépend de l'heure du navigateur. Implémenté avec
 * `Intl` (pas de dépendance), heure d'été comprise.
 */
export const PARIS_TZ = 'Europe/Paris';

export const DEFAULT_SERVICE_HOURS: ServiceHours = {
  '1': { open: '09:00', close: '20:00' },
  '2': { open: '09:00', close: '20:00' },
  '3': { open: '09:00', close: '20:00' },
  '4': { open: '09:00', close: '20:00' },
  '5': { open: '09:00', close: '20:00' },
  '6': { open: '09:00', close: '20:00' },
};

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO : 1 = lundi … 7 = dimanche */
  isoWeekday: number;
};

const WEEKDAYS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string = PARIS_TZ): ZonedParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    isoWeekday: WEEKDAYS[get('weekday')] ?? 1,
  };
}

/** Décalage (minutes) entre l'heure locale du fuseau et UTC, à cet instant. */
export function offsetMinutes(date: Date, tz: string = PARIS_TZ): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/** Instant UTC correspondant à une heure murale du fuseau (heure d'été gérée). */
export function zonedTimeToUtc(
  p: { year: number; month: number; day: number; hour: number; minute: number },
  tz: string = PARIS_TZ,
): Date {
  const naive = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  const off1 = offsetMinutes(new Date(naive), tz);
  let guess = naive - off1 * 60000;
  const off2 = offsetMinutes(new Date(guess), tz);
  if (off2 !== off1) guess = naive - off2 * 60000;
  return new Date(guess);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60000);
}

function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':');
  return { hour: Number(h ?? 0), minute: Number(m ?? 0) };
}

function dayWindow(
  parts: { year: number; month: number; day: number },
  day: ServiceHoursDay,
  tz: string,
): { start: Date; end: Date } {
  const o = parseHm(day.open);
  const c = parseHm(day.close);
  return {
    start: zonedTimeToUtc({ ...parts, hour: o.hour, minute: o.minute }, tz),
    end: zonedTimeToUtc({ ...parts, hour: c.hour, minute: c.minute }, tz),
  };
}

function hoursFor(hours: ServiceHours, isoWeekday: number): ServiceHoursDay | undefined {
  return hours[String(isoWeekday) as keyof ServiceHours];
}

/** Le service est-il ouvert à cet instant ? */
export function isWithinServiceHours(
  date: Date,
  hours: ServiceHours,
  tz: string = PARIS_TZ,
): boolean {
  const p = zonedParts(date, tz);
  const day = hoursFor(hours, p.isoWeekday);
  if (!day) return false;
  const w = dayWindow(p, day, tz);
  return date >= w.start && date < w.end;
}

/** Garde-fou contre une configuration sans aucun jour ouvert. */
const MAX_LOOKAHEAD_DAYS = 14;

/**
 * Prochain instant d'ouverture du service : `date` si déjà ouvert, sinon la
 * prochaine plage. `null` si aucune plage n'est configurée.
 */
export function nextServiceOpening(
  date: Date,
  hours: ServiceHours,
  tz: string = PARIS_TZ,
): Date | null {
  if (isWithinServiceHours(date, hours, tz)) return date;
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const probe = addDays(date, i);
    const p = zonedParts(probe, tz);
    const day = hoursFor(hours, p.isoWeekday);
    if (!day) continue;
    const w = dayWindow(p, day, tz);
    if (w.start > date) return w.start;
  }
  return null;
}

/**
 * Minutes écoulées entre `from` et `to` en ne comptant que le temps de
 * service : c'est le délai de rappel « effectif » du reporting. Un lead reçu
 * samedi 22 h et rappelé lundi 9 h 03 compte 3 minutes.
 */
export function effectiveServiceMinutes(
  from: Date,
  to: Date,
  hours: ServiceHours,
  tz: string = PARIS_TZ,
): number {
  if (to <= from) return 0;
  let total = 0;
  const MAX_DAYS = 400;
  for (let i = 0; i <= MAX_DAYS; i++) {
    const probe = addDays(from, i);
    if (addDays(probe, -1) > to) break;
    const p = zonedParts(probe, tz);
    const day = hoursFor(hours, p.isoWeekday);
    if (!day) continue;
    const w = dayWindow(p, day, tz);
    const start = w.start > from ? w.start : from;
    const end = w.end < to ? w.end : to;
    if (end > start) total += (end.getTime() - start.getTime()) / 60000;
  }
  return Math.round(total * 100) / 100;
}

/** Le lendemain à HH:MM heure du fuseau (ex. « lendemain 10 h »). */
export function nextDayAt(date: Date, hm: string, tz: string = PARIS_TZ): Date {
  const tomorrow = zonedParts(addDays(date, 1), tz);
  const { hour, minute } = parseHm(hm);
  return zonedTimeToUtc({ ...tomorrow, hour, minute }, tz);
}

/** Aujourd'hui à HH:MM heure du fuseau. */
export function todayAt(date: Date, hm: string, tz: string = PARIS_TZ): Date {
  const today = zonedParts(date, tz);
  const { hour, minute } = parseHm(hm);
  return zonedTimeToUtc({ ...today, hour, minute }, tz);
}

/** Lundi 00:00 (heure du fuseau) de la semaine de `date`, comme instant UTC. */
export function weekMonday(date: Date, tz: string = PARIS_TZ): Date {
  const p = zonedParts(date, tz);
  const monday = zonedParts(addDays(date, -(p.isoWeekday - 1)), tz);
  return zonedTimeToUtc(
    { year: monday.year, month: monday.month, day: monday.day, hour: 0, minute: 0 },
    tz,
  );
}

/** Minuit (heure du fuseau) du jour de `date`, comme instant UTC. */
export function startOfDay(date: Date, tz: string = PARIS_TZ): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, tz);
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  hour: '2-digit',
  minute: '2-digit',
});
const DATETIME_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const LONG_FMT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatParis = {
  date: (d: Date): string => DATE_FMT.format(d),
  time: (d: Date): string => TIME_FMT.format(d),
  dateTime: (d: Date): string => DATETIME_FMT.format(d),
  long: (d: Date): string => LONG_FMT.format(d),
};
