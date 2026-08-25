/**
 * Ordre de rappel après un webinaire.
 *
 * Règle métier (décision Killian, révisée) : on rappelle dans l'ordre de
 * l'intérêt commercial réel, pas de la seule présence.
 *
 *   1. ONT REGARDÉ — direct ou replay confondus, triés par un score composite.
 *      Une minute de direct ne vaut pas une heure de replay : c'est la DURÉE
 *      réellement regardée qui compte, pas le canal.
 *   2. NE SONT PAS VENUS — inscrits jamais connectés, triés par capacité
 *      d'investissement (un gros ticket absent reste à rappeler).
 *
 * Le score combine trois signaux, du plus au moins déterminant :
 *   - la CAPACITÉ d'investissement déclarée au formulaire — le levier de
 *     chiffre d'affaires le plus fort ;
 *   - l'ENGAGEMENT, part du webinaire réellement suivie ;
 *   - la DISPONIBILITÉ des fonds sous 30 jours — signal d'imminence.
 * Un clic sur un call-to-action ajoute un bonus : c'est une demande explicite.
 *
 * Module volontairement pur (aucun accès base, aucune date « maintenant ») :
 * l'ordre de travail des closers est une règle métier, elle doit être
 * vérifiable par un test plutôt que constatée à l'écran.
 */

export type WebinarBucket = 'watched' | 'no_show';

/** Tranches réellement proposées par le formulaire WebinarGeek de SAH. */
export type CapacityTier = {
  /** Rang croissant : 0 = inconnu, 1 = le plus petit ticket. */
  rank: number;
  label: string;
};

/**
 * Barème des capacités.
 *
 * ⚠️ « 25 000€ - 50 0000€ » comporte une coquille dans le formulaire (un zéro
 * en trop). On la reconnaît telle quelle pour ne pas perdre les réponses déjà
 * collectées ; à corriger côté WebinarGeek.
 *
 * « Je ne sais pas encore » est classé AU-DESSUS de « Moins de 10 000€ » :
 * un montant inconnu garde tout son potentiel, alors qu'un petit ticket
 * déclaré est un plafond connu. C'est justement à l'appel de le qualifier.
 */
const CAPACITY_TIERS: { match: string; rank: number; label: string }[] = [
  // ⚠️ ORDRE SIGNIFICATIF : la reconnaissance se fait par sous-chaîne, et les
  // libellés s'emboîtent (« 50 000€ - 250 000€ » contient « 250 000 »). On va
  // donc du plus spécifique au plus général — un test verrouille chaque tranche.
  { match: '+500 000', rank: 6, label: 'Plus de 500 k€' },
  { match: '250 000€ - 500 000', rank: 5, label: '250 à 500 k€' },
  { match: '50 000€ - 250 000', rank: 4, label: '50 à 250 k€' },
  { match: '25 000€ - 50 0000', rank: 3, label: '25 à 50 k€' },
  { match: '10 000€ - 25 000', rank: 2, label: '10 à 25 k€' },
  { match: 'je ne sais pas', rank: 1.5, label: 'À qualifier' },
  { match: 'moins de 10 000', rank: 1, label: 'Moins de 10 k€' },
];

const MAX_CAPACITY_RANK = 6;

export function parseCapacity(raw: string | null | undefined): CapacityTier {
  if (!raw) return { rank: 0, label: 'Non renseignée' };
  const normalized = raw.trim().toLowerCase();
  for (const tier of CAPACITY_TIERS) {
    if (normalized.includes(tier.match.toLowerCase())) {
      return { rank: tier.rank, label: tier.label };
    }
  }
  return { rank: 0, label: raw.trim() };
}

/** « Oui » / « En partie » / « Non » → 1 / 0.5 / 0. */
export function parseAvailability(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = raw.trim().toLowerCase();
  if (n.startsWith('oui')) return 1;
  if (n.startsWith('en partie')) return 0.5;
  return 0;
}

export type CallOrderInput = {
  watchedLive: boolean;
  watchedReplay: boolean;
  watchDurationS: number | null;
  watchDurationReplayS: number | null;
  /** Réponse brute à « Capacité d'inscription ». */
  capacityRaw?: string | null;
  /** Réponse brute à « Disponibilité des fonds sous 30 jours ». */
  availabilityRaw?: string | null;
  /** Nombre de call-to-action cliqués pendant le webinaire. */
  ctaCount?: number;
  /** Durée du webinaire, pour rapporter le temps regardé à un pourcentage. */
  webinarDurationS?: number | null;
};

/** Poids des trois signaux. Leur somme fait 1 — le score reste sur 0-100. */
const W_CAPACITY = 0.45;
const W_ENGAGEMENT = 0.4;
const W_AVAILABILITY = 0.15;
/** Un CTA cliqué est une demande explicite : il pèse lourd, mais reste borné. */
const CTA_BONUS = 12;
const CTA_BONUS_MAX = 24;
/** Départage à engagement égal : le direct traduit une disponibilité réelle. */
const LIVE_TIEBREAK = 1;

export function getBucket(r: CallOrderInput): WebinarBucket {
  return r.watchedLive || r.watchedReplay ? 'watched' : 'no_show';
}

/** Temps total regardé, direct et replay confondus. */
export function totalWatchedS(r: CallOrderInput): number {
  return (r.watchDurationS ?? 0) + (r.watchDurationReplayS ?? 0);
}

/**
 * Part du webinaire réellement suivie, de 0 à 100.
 * Sans durée de webinaire connue, on retombe sur un plafond d'une heure —
 * imparfait, mais préférable à écarter du classement tous les inscrits d'un
 * webinaire dont la durée n'a pas été remontée.
 */
const FALLBACK_WEBINAR_S = 3600;

export function engagementScore(r: CallOrderInput): number {
  const total = totalWatchedS(r);
  if (total <= 0) return 0;
  const reference =
    r.webinarDurationS && r.webinarDurationS > 0 ? r.webinarDurationS : FALLBACK_WEBINAR_S;
  return Math.min(100, Math.round((total / reference) * 100));
}

/** Score de rappel sur 100. Plus il est haut, plus l'appel est prioritaire. */
export function callScore(r: CallOrderInput): number {
  const capacity = (parseCapacity(r.capacityRaw).rank / MAX_CAPACITY_RANK) * 100;
  const engagement = engagementScore(r);
  const availability = parseAvailability(r.availabilityRaw) * 100;

  const base = capacity * W_CAPACITY + engagement * W_ENGAGEMENT + availability * W_AVAILABILITY;

  const cta = Math.min(CTA_BONUS_MAX, (r.ctaCount ?? 0) * CTA_BONUS);
  const tiebreak = r.watchedLive ? LIVE_TIEBREAK : 0;

  return Math.round(Math.min(100, base + cta) + tiebreak);
}

/**
 * Comparateur : ceux qui ont regardé d'abord, puis par score décroissant.
 * Le groupe prime pour que jamais un absent ne passe devant quelqu'un qui a
 * pris le temps de regarder, même avec une grosse capacité déclarée.
 */
export function compareForCallOrder(a: CallOrderInput, b: CallOrderInput): number {
  const bucketA = getBucket(a);
  const bucketB = getBucket(b);
  if (bucketA !== bucketB) return bucketA === 'watched' ? -1 : 1;
  return callScore(b) - callScore(a);
}

export const BUCKET_LABELS: Record<WebinarBucket, string> = {
  watched: 'Ont regardé',
  no_show: 'Ne sont pas venus',
};

export const BUCKET_HINTS: Record<WebinarBucket, string> = {
  watched:
    'Direct et replay confondus — classés par capacité, engagement et disponibilité des fonds.',
  no_show:
    'Inscrits jamais connectés. Classés par capacité : un gros ticket absent reste à rappeler.',
};

export const BUCKET_ORDER: WebinarBucket[] = ['watched', 'no_show'];

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
