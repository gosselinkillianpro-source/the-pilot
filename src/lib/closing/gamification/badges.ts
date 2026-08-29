/**
 * Badges du closing — définitions + règles d'obtention, pures et testables.
 *
 * Un badge se décroche PAR SEMAINE (clé ISO « 2026-W35 ») : la collection
 * grossit au fil des semaines (Sniper ×4…). Le balayage (cron gamification)
 * évalue ces règles sur l'activité de la semaine courante et n'insère que ce
 * qui manque — l'unicité (closer, badge, semaine) est garantie en base.
 *
 * « Roi de la semaine » est le seul badge évalué sur la semaine ÉCOULÉE : on
 * ne sacre pas un roi au milieu du match.
 */

export type BadgeKey = 'eclair' | 'serie' | 'sniper' | 'gros_poisson' | 'leve_tot' | 'roi_semaine';

export type BadgeDef = {
  key: BadgeKey;
  emoji: string;
  label: string;
  description: string;
};

export const BADGES: Record<BadgeKey, BadgeDef> = {
  eclair: {
    key: 'eclair',
    emoji: '⚡',
    label: 'Éclair',
    description: 'Un lead rappelé moins de 5 minutes après son inscription.',
  },
  serie: {
    key: 'serie',
    emoji: '🔥',
    label: 'Série',
    description: "5 jours d'affilée avec 10 appels ou plus.",
  },
  sniper: {
    key: 'sniper',
    emoji: '🎯',
    label: 'Sniper',
    description: '3 souscriptions attribuées dans la semaine.',
  },
  gros_poisson: {
    key: 'gros_poisson',
    emoji: '💰',
    label: 'Gros poisson',
    description: 'Une souscription attribuée de plus de 50 000 €.',
  },
  leve_tot: {
    key: 'leve_tot',
    emoji: '🌅',
    label: 'Lève-tôt',
    description: 'Un appel passé avant 9 h 30.',
  },
  roi_semaine: {
    key: 'roi_semaine',
    emoji: '👑',
    label: 'Roi de la semaine',
    description: '1er du classement XP de la semaine écoulée.',
  },
};

/** Seuils — regroupés ici pour être ajustables d'un coup d'œil. */
export const BADGE_RULES = {
  SERIE_DAYS: 5,
  SERIE_MIN_CALLS_PER_DAY: 10,
  SNIPER_MIN_SUBS: 3,
  GROS_POISSON_MIN_EUR: 50_000,
  /** Heure de Paris limite (9 h 30 → 9.5) pour le Lève-tôt. */
  LEVE_TOT_MAX_HOUR: 9.5,
} as const;

/** Activité d'un closer sur la semaine courante, prémâchée par le leaderboard. */
export type WeekActivity = {
  /** Rappels < 5 min après inscription (bonus éclair). */
  fastCallbacks: number;
  /** Appels par jour civil parisien (« 2026-08-29 » → 14), fenêtre glissante récente. */
  callsByDay: Record<string, number>;
  /** Souscriptions attribuées sur la semaine. */
  subscriptions: number;
  /** Plus grosse souscription attribuée (€) sur la semaine. */
  maxSubscriptionEur: number;
  /** Au moins un appel passé avant 9 h 30 (heure de Paris) cette semaine. */
  hasEarlyCall: boolean;
};

/** Y a-t-il N jours CONSÉCUTIFS avec au moins `minCalls` appels ? */
export function hasCallStreak(
  callsByDay: Record<string, number>,
  streakDays = BADGE_RULES.SERIE_DAYS,
  minCalls = BADGE_RULES.SERIE_MIN_CALLS_PER_DAY,
): boolean {
  const qualifying = Object.entries(callsByDay)
    .filter(([, calls]) => calls >= minCalls)
    .map(([day]) => day)
    .sort();
  if (qualifying.length < streakDays) return false;

  let streak = 1;
  for (let i = 1; i < qualifying.length; i++) {
    const prev = new Date(`${qualifying[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${qualifying[i]}T00:00:00Z`).getTime();
    streak = cur - prev === 86_400_000 ? streak + 1 : 1;
    if (streak >= streakDays) return true;
  }
  return false;
}

/** Badges de la semaine COURANTE gagnés par cette activité (hors Roi de la semaine). */
export function earnedWeeklyBadges(activity: WeekActivity): BadgeKey[] {
  const earned: BadgeKey[] = [];
  if (activity.fastCallbacks >= 1) earned.push('eclair');
  if (hasCallStreak(activity.callsByDay)) earned.push('serie');
  if (activity.subscriptions >= BADGE_RULES.SNIPER_MIN_SUBS) earned.push('sniper');
  if (activity.maxSubscriptionEur >= BADGE_RULES.GROS_POISSON_MIN_EUR) earned.push('gros_poisson');
  if (activity.hasEarlyCall) earned.push('leve_tot');
  return earned;
}
