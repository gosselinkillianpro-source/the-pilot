/**
 * Démarrage du serveur (exécuté une fois, avant toute requête).
 *
 * Force le fuseau horaire du process sur l'heure de Paris. Sans ça, le serveur
 * Render tourne en UTC : toutes les dates/heures affichées (toLocaleString…) et
 * les calculs « aujourd'hui » côté serveur sont décalés de 1 à 2 h.
 *
 * NB : pour une garantie 100 % côté hébergeur, on peut aussi définir la variable
 * d'environnement TZ=Europe/Paris dans Render (cf. message à Killian).
 */
export function register() {
  // Node ré-applique le fuseau dès qu'on assigne process.env.TZ → effet immédiat.
  process.env.TZ = 'Europe/Paris';
}
