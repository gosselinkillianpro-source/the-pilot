/**
 * Inscrits de la nuit — à rappeler en priorité à la réouverture.
 *
 * Entre 20 h et 9 h (heure de Paris), aucune alerte Telegram ne part : le lead
 * reste silencieusement en file (voir new-lead-alert.ts). Le matin, ces
 * inscrits doivent être le PREMIER réflexe des closers — d'où une liste
 * dédiée en haut de la file d'appels, plutôt que de les laisser noyés dans
 * le tri par score.
 *
 * Module pur : la règle « inscrit pendant les heures calmes » se teste sans
 * base ni horloge réelle.
 */

import { parisHour, QUIET_HOURS_END, QUIET_HOURS_START } from './new-lead-alert';

/** Fenêtre de rattrapage : au-delà, le lead n'a plus rien d'un « inscrit de la nuit ». */
export const NIGHT_LEAD_MAX_AGE_HOURS = 36;

/** L'inscription est-elle tombée pendant les heures calmes (20 h → 9 h, Paris) ? */
export function isNightSignup(signedUpAt: Date): boolean {
  const hour = parisHour(signedUpAt);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}
