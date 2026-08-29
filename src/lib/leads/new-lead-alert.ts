/**
 * Alerte « nouveau lead BREACH » — appeler dans les 5 minutes.
 *
 * Un lead rappelé dans les 5 minutes convertit bien mieux qu'un lead rappelé
 * le lendemain. Encore faut-il que le closer SACHE, tout de suite, qu'il vient
 * d'arriver : la file d'appels ne sert à rien si personne ne la regarde à
 * l'instant où l'inscription tombe.
 *
 * Ce module décide À QUI et QUOI envoyer. L'envoi lui-même (Telegram) et la
 * détection (synchro SAH) vivent ailleurs — ici, rien que la règle, testable.
 *
 * ⚠️ VOLUME : 1 à 6 inscrits BREACH par jour (mesuré sur 14 jours). Une alerte
 * par inscrit est donc tenable. Si le rythme changeait d'un ordre de grandeur,
 * c'est ce module qu'il faudrait revoir — pas le canal.
 */

/**
 * Plage sans alerte (heure de Paris) : 20 h → 9 h.
 *
 * Choix de Killian, plus large que la nuit stricte : passé 20 h un inscrit ne
 * décroche plus, et avant 9 h le closer n'est pas en poste. Un lead arrivé
 * dans cette plage n'est PAS marqué — son alerte part à la réouverture, avec
 * l'ancienneté réelle affichée dans le message.
 */
export const QUIET_HOURS_END = 9;
export const QUIET_HOURS_START = 20;
/**
 * Âge maximal d'une inscription pour valoir une alerte poussée.
 *
 * Au-delà, l'urgence des 5 minutes est passée depuis longtemps : la personne
 * reste dans la file d'appels, mais on ne fait plus sonner un téléphone pour
 * elle. Évite aussi qu'un incident de synchro déclenche une avalanche de
 * notifications sur des inscriptions vieilles de plusieurs jours.
 *
 * ⚠️ DOIT rester STRICTEMENT supérieur à la plage calme (20 h → 9 h = 13 h) :
 * à 12 h, un inscrit de 20 h 05 avait déjà « expiré » à la réouverture de
 * 9 h — jamais alerté, silencieusement. 14 h laisse une heure de marge.
 */
export const MAX_LEAD_AGE_MINUTES = 14 * 60;

export type NewLead = {
  investorId: string;
  sahId: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  bonusCode: string | null;
  city: string | null;
  createdAt: Date;
};

export type AlertDecision =
  | { send: true }
  /** Pourquoi on n'envoie pas — tracé dans les logs du cron, jamais silencieux. */
  | { send: false; reason: string };

/** Heure locale française, quelle que soit l'heure du serveur. */
export function parisHour(at: Date): number {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    hour12: false,
  }).format(at);
  return Number.parseInt(formatted, 10);
}

/**
 * Faut-il pousser une notification pour ce lead, maintenant ?
 *
 * La nuit, non : un closer réveillé à 3 h ne rappellera pas mieux, et
 * l'inscrit ne décrocherait pas non plus. Le lead reste en file, il sera
 * travaillé au matin.
 */
export function shouldAlert(lead: NewLead, now: Date): AlertDecision {
  const ageMinutes = (now.getTime() - lead.createdAt.getTime()) / 60_000;
  if (ageMinutes > MAX_LEAD_AGE_MINUTES) {
    return { send: false, reason: `inscription vieille de ${Math.round(ageMinutes / 60)} h` };
  }
  // Une date d'inscription dans le futur = horloge décalée côté SAH. On alerte
  // quand même : mieux vaut un appel de trop qu'un lead perdu.
  const hour = parisHour(now);
  if (hour < QUIET_HOURS_END || hour >= QUIET_HOURS_START) {
    return { send: false, reason: `heure calme (${hour} h)` };
  }
  if (!lead.phone) {
    // Sans numéro, l'alerte « rappelle dans les 5 minutes » n'a pas d'objet.
    return { send: false, reason: 'aucun téléphone renseigné' };
  }
  return { send: true };
}

/** Numéro au format international, cliquable depuis un téléphone. */
export function telLink(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  // Numéro français saisi en 06… : le préfixe manque, on le rétablit.
  if (cleaned.startsWith('0')) return `+33${cleaned.slice(1)}`;
  return cleaned;
}

function minutesSince(from: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
}

/**
 * Le message poussé sur le portable du closer.
 *
 * Tout ce qu'il faut pour décrocher son téléphone SANS ouvrir l'app : le nom,
 * le numéro, l'ancienneté de l'inscription. Le lien vers la fiche vient après,
 * pour le contexte et pour enregistrer l'appel.
 *
 * Format Telegram HTML : seul un sous-ensemble de balises est accepté, et le
 * texte injecté doit être échappé (un nom contenant « & » casserait le message).
 * ⚠️ PAS de <a href="tel:..."> : l'API Bot refuse ce protocole (400 « Unsupported
 * URL protocol ») et l'alerte entière partait à la poubelle. Le numéro passe en
 * texte au format international : les clients Telegram le rendent cliquable
 * d'eux-mêmes.
 */
export function buildAlertMessage(lead: NewLead, now: Date, appUrl: string): string {
  const age = minutesSince(lead.createdAt, now);
  const quand = age <= 1 ? "à l'instant" : `il y a ${age} min`;
  const nom = esc(lead.fullName?.trim() || lead.email);
  const lignes = [`🔥 <b>Nouveau lead BREACH</b> — inscrit ${quand}`, '', `<b>${nom}</b>`];
  if (lead.phone) {
    lignes.push(`📞 ${esc(telLink(lead.phone))}`);
  }
  lignes.push(`✉️ ${esc(lead.email)}`);
  if (lead.city) lignes.push(`📍 ${esc(lead.city)}`);
  if (lead.bonusCode) lignes.push(`🏷️ ${esc(lead.bonusCode)}`);
  lignes.push('');
  lignes.push(`<a href="${esc(appUrl)}/closing/investor/${lead.investorId}">Ouvrir la fiche</a>`);
  lignes.push('<i>Rappel dans les 5 minutes : c’est là que ça se joue.</i>');
  return lignes.join('\n');
}

/** Échappe le texte injecté dans un message Telegram en mode HTML. */
function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
