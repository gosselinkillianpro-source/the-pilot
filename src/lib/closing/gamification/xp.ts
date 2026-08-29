/**
 * Barème XP du closing — LE fichier à ajuster pour rééquilibrer le jeu.
 *
 * L'XP n'est jamais stockée : elle se recalcule depuis les données réelles
 * (appels, souscriptions attribuées, progressions). Changer une valeur ici
 * recalcule donc tout l'historique — c'est voulu : pas de dette de points.
 *
 * Barème validé par Killian (29/08/2026). Les conversions passent par le
 * moteur d'attribution existant (appel prime, fenêtre 30 jours).
 */

export const XP_RULES = {
  /** Chaque appel passé (sortant ou entrant enregistré). */
  CALL: 10,
  /** Bonus quand la personne décroche (10 + 15 = 25 XP pour un appel joint). */
  REACHED_BONUS: 15,
  /** RDV pris (interaction meeting_booked). */
  MEETING_BOOKED: 50,
  /** Profil complété suite à ton appel (registration_complete attribué). */
  REGISTRATION_COMPLETED: 100,
  /** Inscription finalisée / KYC débloqué suite à ton appel. */
  KYC_COMPLETED: 100,
  /** Souscription attribuée à ton appel. */
  SUBSCRIPTION: 300,
  /** + 1 XP par tranche de 100 € collectés sur les souscriptions attribuées. */
  AMOUNT_EUR_PER_XP: 100,
  /** Bonus éclair : 1er appel du lead moins de 5 minutes après son inscription. */
  FAST_CALLBACK: 50,
} as const;

/** Fenêtre du bonus éclair, en minutes. */
export const FAST_CALLBACK_MAX_MINUTES = 5;

/** Ce que le calcul d'XP consomme — tout est compté ailleurs, ici on ne fait qu'appliquer le barème. */
export type XpInputs = {
  calls: number;
  reached: number;
  meetingsBooked: number;
  registrations: number;
  kycs: number;
  subscriptions: number;
  /** Total collecté (€) sur les souscriptions attribuées. */
  amountEur: number;
  fastCallbacks: number;
};

export function computeXp(s: XpInputs): number {
  return (
    s.calls * XP_RULES.CALL +
    s.reached * XP_RULES.REACHED_BONUS +
    s.meetingsBooked * XP_RULES.MEETING_BOOKED +
    s.registrations * XP_RULES.REGISTRATION_COMPLETED +
    s.kycs * XP_RULES.KYC_COMPLETED +
    s.subscriptions * XP_RULES.SUBSCRIPTION +
    Math.floor(Math.max(0, s.amountEur) / XP_RULES.AMOUNT_EUR_PER_XP) +
    s.fastCallbacks * XP_RULES.FAST_CALLBACK
  );
}

/**
 * Niveaux à vie — l'XP ne se remet jamais à zéro (décision Killian) : les
 * classements par période restent compétitifs via les stats de la période,
 * le niveau raconte la progression long terme.
 */
export const LEVELS = [
  { floor: 0, name: 'Rookie', emoji: '🌱' },
  { floor: 500, name: 'Espoir', emoji: '🥉' },
  { floor: 1500, name: 'Confirmé', emoji: '🥈' },
  { floor: 4000, name: 'Chasseur', emoji: '🥇' },
  { floor: 10000, name: 'Élite', emoji: '💎' },
  { floor: 25000, name: 'Légende', emoji: '👑' },
] as const;

export type Level = {
  name: string;
  emoji: string;
  index: number;
  floor: number;
  /** Plancher du niveau suivant — null au dernier niveau. */
  next: number | null;
  /** Progression vers le niveau suivant, 0–100 (100 au dernier niveau). */
  progressPct: number;
};

export function levelFor(xp: number): Level {
  const safe = Math.max(0, xp);
  let index = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (safe >= LEVELS[i].floor) {
      index = i;
      break;
    }
  }
  const level = LEVELS[index];
  const nextLevel = LEVELS[index + 1] ?? null;
  const next = nextLevel?.floor ?? null;
  const progressPct =
    next == null ? 100 : Math.floor(((safe - level.floor) / (next - level.floor)) * 100);
  return { name: level.name, emoji: level.emoji, index, floor: level.floor, next, progressPct };
}
