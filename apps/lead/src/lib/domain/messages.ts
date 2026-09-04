import { labelFor } from './answers/mep';

/**
 * Textes des alertes et SMS — purs, testables. Le HTML Telegram est échappé
 * ici, jamais dans les handlers.
 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type LeadSummary = {
  sourceName: string;
  firstName: string;
  answers: Record<string, string>;
  url: string;
};

/** « Nouveau lead MEP · Marc · 10-50K · impôts · 3 mois · [lien] » (section 4.2). */
export function newLeadAlertHtml(lead: LeadSummary, options: { offHours?: boolean } = {}): string {
  const parts = [
    `<b>Nouveau lead ${esc(lead.sourceName)}</b>`,
    esc(lead.firstName),
    esc(labelFor('montant', lead.answers.montant)),
    esc(labelFor('objectif', lead.answers.objectif)),
    esc(labelFor('urgence', lead.answers.urgence)),
  ];
  const head = parts.join(' · ');
  const tail = options.offHours ? '\n<i>Reçu hors service, à rappeler en premier.</i>' : '';
  return `${head}\n<a href="${esc(lead.url)}">Ouvrir la fiche d’appel</a>${tail}`;
}

export function slaEscalationHtml(lead: LeadSummary, minutes: number, level: number): string {
  const label = level >= 2 ? '🔴 Toujours pas rappelé' : '🟠 Pas encore rappelé';
  return `${label} : <b>${esc(lead.firstName)}</b> (${esc(lead.sourceName)}) attend depuis ${Math.round(minutes)} min.\n<a href="${esc(lead.url)}">Appeler maintenant</a>`;
}

export function callbackDueHtml(lead: LeadSummary): string {
  return `⏰ Rappel convenu : <b>${esc(lead.firstName)}</b> (${esc(lead.sourceName)}) attend votre appel maintenant.\n<a href="${esc(lead.url)}">Ouvrir la fiche</a>`;
}

export function attemptDueHtml(lead: LeadSummary, attempt: number): string {
  return `🔁 Relance n°${attempt} : <b>${esc(lead.firstName)}</b> (${esc(lead.sourceName)}).\n<a href="${esc(lead.url)}">Ouvrir la fiche</a>`;
}

/** Remplace `{cle}` par sa valeur ; une clé inconnue reste vide. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

export const DEFAULT_OFF_HOURS_SMS =
  '{source} : merci {prenom}, votre demande est bien reçue. Un conseiller vous rappelle dès {reprise}. À très vite.';

export const DEFAULT_SLOT_SMS =
  '{source} : bonjour {prenom}, nous avons tenté de vous joindre sans succès. Indiquez le moment qui vous convient pour être rappelé(e) : {lien}';

export const DEFAULT_CONFIRMATION_SMS =
  '{source} : votre rendez-vous avec {expert} est confirmé le {date}. Un empêchement ? Replanifiez ici : {lien}';

export const DEFAULT_REMINDER_SMS =
  '{source} : rappel de votre rendez-vous {quand} avec {expert}, le {date}. Un empêchement ? {lien}';
