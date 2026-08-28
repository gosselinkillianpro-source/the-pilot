/**
 * Canaux de synchronisation temps réel.
 *
 * THE PILOT est un outil à plusieurs mains : deux closers travaillent la même
 * file, un admin qualifie pendant qu'un autre appelle. Sans signal, chacun
 * voyait l'écran figé au moment de son dernier chargement — d'où des fiches
 * appelées deux fois et des cartes déplacées « toutes seules » au rechargement.
 *
 * ⚠️ CE QUI CIRCULE : rien d'autre que le NOM du canal. Aucune donnée
 * d'investisseur, aucun montant, aucun identifiant ne transite par le message.
 * Le client reçoit « le suivi des appels a changé » et redemande la page au
 * serveur, qui applique les droits comme d'habitude. C'est ce qui permet de
 * diffuser sans ouvrir la RLS ni publier les tables en réplication.
 *
 * Module sans dépendance serveur : il est importé des deux côtés.
 */

export const SYNC_TOPICS = {
  /** Tableau de suivi des appels + file d'appels + cockpit « Aujourd'hui ». */
  closing: 'closing',
  /** Tableau de suivi des inscrits webinaire et pages webinaire. */
  webinars: 'webinars',
  /** Synchro SAH terminée : chiffres, listes et cartes ont pu bouger partout. */
  sah: 'sah',
} as const;

export type SyncTopic = (typeof SYNC_TOPICS)[keyof typeof SYNC_TOPICS];

/** Nom du canal Realtime partagé par toute l'app. */
export const SYNC_CHANNEL = 'pilot-sync';
