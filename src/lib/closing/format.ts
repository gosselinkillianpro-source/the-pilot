import { NEXT_ACTION_LABELS, type NextActionKind } from './next-action';

/** Petits formats partagés par les écrans closers (pur, utilisable côté client). */

export function eur(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function fmtAgo(d: Date, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

export function fmtDay(d: Date): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Paris',
  });
}

export function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

/** Types historiques de `closer_tasks` (avant la refonte) + les suites du mode appel. */
const LEGACY_TASK_LABELS: Record<string, string> = {
  callback: 'Rappel',
  email: 'Email',
  message: 'Message',
  todo: 'Tâche',
};

export function taskLabel(type: string): string {
  if (type in NEXT_ACTION_LABELS) return NEXT_ACTION_LABELS[type as NextActionKind];
  return LEGACY_TASK_LABELS[type] ?? 'Action';
}

const OUTCOME_LABELS: Record<string, string> = {
  reached: 'joint',
  no_answer: 'pas de réponse',
  voicemail: 'répondeur',
  wrong_number: 'faux numéro',
  callback_scheduled: 'rappel programmé',
  profile_incompatible: 'profil incompatible',
  in_progress: 'en cours',
};

const ACTIVITY_LABELS: Record<string, string> = {
  call_outbound: 'appel',
  call_inbound: 'appel entrant',
  email_sent: 'mail envoyé',
  sms_sent: 'SMS envoyé',
  whatsapp_sent: 'WhatsApp envoyé',
  meeting_booked: 'RDV pris',
  meeting_done: 'RDV fait',
  proposal_sent: 'proposition envoyée',
  note_added: 'note',
  email_opened: 'mail ouvert',
  email_clicked: 'clic mail',
};

/** « appel · pas de réponse », « SMS envoyé »… pour une dernière activité. */
export function activityLabel(activity: { type: string; outcome: string | null }): string {
  const base = ACTIVITY_LABELS[activity.type] ?? activity.type;
  const outcome = activity.outcome ? OUTCOME_LABELS[activity.outcome] : null;
  return outcome ? `${base} · ${outcome}` : base;
}

export function outcomeLabel(outcome: string | null): string | null {
  return outcome ? (OUTCOME_LABELS[outcome] ?? outcome) : null;
}
