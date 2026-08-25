/**
 * Ordre de rappel après un webinaire.
 *
 * Règle métier (décision Killian) : on rappelle dans l'ordre de l'intérêt
 * démontré.
 *
 *   1. PRÉSENTS EN DIRECT — les plus engagés, triés par durée de visionnage
 *      décroissante. Quelqu'un resté 50 minutes sur 60 est incomparablement
 *      plus chaud que quelqu'un parti au bout de deux.
 *   2. REPLAY — absents du direct, mais qui ont regardé après coup. Intérêt
 *      réel, juste décalé. Triés eux aussi par durée.
 *   3. NO-SHOW — inscrits jamais venus. À rappeler en dernier.
 *
 * Module volontairement pur (aucun accès base, aucune date « maintenant ») :
 * l'ordre d'appel des closers est une règle métier, elle doit être vérifiable
 * par un test plutôt que constatée à l'écran.
 */

export type WebinarBucket = 'present' | 'replay' | 'no_show';

export type CallOrderInput = {
  watchedLive: boolean;
  watchedReplay: boolean;
  watchDurationS: number | null;
  watchDurationReplayS: number | null;
  /** Nombre de CTA cliqués — signal d'intérêt fort, affiché, non trieur. */
  ctaCount?: number;
};

export const BUCKET_LABELS: Record<WebinarBucket, string> = {
  present: 'Présents en direct',
  replay: 'Ont regardé le replay',
  no_show: 'Ne sont pas venus',
};

export const BUCKET_HINTS: Record<WebinarBucket, string> = {
  present: 'À rappeler en priorité, du plus assidu au moins assidu.',
  replay: 'Absents du direct mais intéressés — ils ont pris le temps de regarder.',
  no_show: 'Inscrits jamais venus. Relance douce ou proposition de replay.',
};

/** Ordre d'affichage des groupes. L'index sert aussi de rang de tri. */
export const BUCKET_ORDER: WebinarBucket[] = ['present', 'replay', 'no_show'];

export function getBucket(r: CallOrderInput): WebinarBucket {
  if (r.watchedLive) return 'present';
  if (r.watchedReplay) return 'replay';
  return 'no_show';
}

/**
 * Durée qui sert au tri à l'intérieur d'un groupe.
 * Pour un présent c'est le direct, pour un replay c'est le replay — comparer
 * les deux entre eux n'aurait pas de sens, mais ils ne se croisent jamais
 * puisqu'ils sont dans des groupes différents.
 */
export function sortDurationS(r: CallOrderInput): number {
  const bucket = getBucket(r);
  if (bucket === 'present') return r.watchDurationS ?? 0;
  if (bucket === 'replay') return r.watchDurationReplayS ?? 0;
  return 0;
}

/**
 * Comparateur complet : groupe d'abord, puis durée décroissante.
 * À durée égale, celui qui a cliqué le plus de CTA passe devant — un clic sur
 * « être rappelé » vaut mieux qu'un départage arbitraire.
 */
export function compareForCallOrder(a: CallOrderInput, b: CallOrderInput): number {
  const rankA = BUCKET_ORDER.indexOf(getBucket(a));
  const rankB = BUCKET_ORDER.indexOf(getBucket(b));
  if (rankA !== rankB) return rankA - rankB;

  const durA = sortDurationS(a);
  const durB = sortDurationS(b);
  if (durA !== durB) return durB - durA;

  return (b.ctaCount ?? 0) - (a.ctaCount ?? 0);
}

/** Groupe les inscrits dans l'ordre de rappel, groupes vides compris. */
export function groupByBucket<T extends CallOrderInput>(
  rows: T[],
): { bucket: WebinarBucket; label: string; hint: string; rows: T[] }[] {
  const sorted = [...rows].sort(compareForCallOrder);
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    hint: BUCKET_HINTS[bucket],
    rows: sorted.filter((r) => getBucket(r) === bucket),
  }));
}

/** « 47 min », « 1 h 12 », « — » — lisible d'un coup d'œil dans une liste. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/**
 * Part du webinaire réellement suivie, en pourcentage.
 * Renvoie null si la durée du webinaire est inconnue — mieux vaut ne rien
 * afficher qu'un pourcentage calculé sur une hypothèse.
 */
export function attendanceRate(
  watchedS: number | null,
  webinarDurationMinutes: number | null,
): number | null {
  if (!watchedS || !webinarDurationMinutes || webinarDurationMinutes <= 0) return null;
  return Math.min(100, Math.round((watchedS / (webinarDurationMinutes * 60)) * 100));
}
