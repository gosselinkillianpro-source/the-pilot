/**
 * Client Calendly API v2 — LECTURE SEULE.
 *
 * THE PILOT = miroir read-only : on lit l'agenda de Guillaume, on ne crée/modifie
 * jamais rien côté Calendly. Auth par Personal Access Token (env `CALENDLY_TOKEN`),
 * posé dans Render (jamais en dur, jamais dans un prompt LLM).
 *
 * Docs : https://developer.calendly.com/api-docs
 */

import { createHash } from 'node:crypto';
import { cached } from '@/lib/cache/ttl';

const CALENDLY_API = 'https://api.calendly.com';

export class CalendlyError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CalendlyError';
    this.status = status;
  }
}

export interface CalendlyUser {
  uri: string;
  name: string;
  email: string;
  schedulingUrl: string;
  organization: string;
}

export interface CalendlyEvent {
  uri: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
}

export interface CalendlyInvitee {
  name: string;
  email: string;
  status: string;
  noShow: boolean; // marqué absent (no-show) côté Calendly
  rescheduled: boolean; // RDV reprogrammé par l'invité
  /** Téléphone : rappel SMS Calendly, ou réponse « téléphone » du formulaire. */
  phone: string | null;
}

/* --- Helpers de lecture sûre (réponses externes → unknown) --- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Jeton à utiliser pour un appel.
 *
 * Depuis le passage à OAuth, l'appelant fournit le jeton du closer dont on lit
 * l'agenda. Le repli sur `CALENDLY_TOKEN` est TRANSITOIRE : il maintient la page
 * de Guillaume pendant que chacun relie son compte. À supprimer une fois tous
 * les closers connectés (et la variable retirée de Render).
 */
function token(accessToken?: string): string {
  const t = accessToken ?? process.env.CALENDLY_TOKEN;
  if (!t) throw new CalendlyError('Aucun compte Calendly relié', undefined);
  return t;
}

async function call(path: string, accessToken?: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${CALENDLY_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token(accessToken)}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
  } catch (e) {
    throw new CalendlyError(
      `Connexion à Calendly impossible : ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j: unknown = await res.json();
      if (isRecord(j) && typeof j.message === 'string') detail = j.message;
      else if (isRecord(j) && typeof j.title === 'string') detail = j.title;
    } catch {
      // corps non-JSON : on garde juste le code HTTP
    }
    throw new CalendlyError(
      `Calendly a répondu ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
      res.status,
    );
  }
  return res.json();
}

/** Durée de vie du cache Calendly (invités, identité du compte). */
const CALENDLY_CACHE_MS = 5 * 60_000;

/** Empreinte courte et non réversible d'un jeton — pour une clé de cache, jamais le jeton lui-même. */
function tokenFingerprint(accessToken?: string): string {
  const token = accessToken ?? process.env.CALENDLY_TOKEN ?? '';
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/** Identité du compte Calendly rattaché au jeton fourni (cachée : elle ne change pas). */
export function getCurrentUser(accessToken?: string): Promise<CalendlyUser> {
  return cached(`calendly:me:${tokenFingerprint(accessToken)}`, CALENDLY_CACHE_MS, () =>
    getCurrentUserUncached(accessToken),
  );
}

async function getCurrentUserUncached(accessToken?: string): Promise<CalendlyUser> {
  const data = await call('/users/me', accessToken);
  const r = isRecord(data) && isRecord(data.resource) ? data.resource : {};
  return {
    uri: str(r.uri),
    name: str(r.name),
    email: str(r.email),
    schedulingUrl: str(r.scheduling_url),
    organization: str(r.current_organization),
  };
}

/** RDV à venir du user, triés par date de début croissante. */
export async function getUpcomingEvents(
  userUri: string,
  count = 20,
  accessToken?: string,
): Promise<CalendlyEvent[]> {
  const minStart = new Date().toISOString();
  const params = new URLSearchParams({
    user: userUri,
    status: 'active',
    min_start_time: minStart,
    sort: 'start_time:asc',
    count: String(count),
  });
  const data = await call(`/scheduled_events?${params.toString()}`, accessToken);
  const collection = isRecord(data) && Array.isArray(data.collection) ? data.collection : [];
  return collection.filter(isRecord).map((e) => ({
    uri: str(e.uri),
    name: str(e.name),
    status: str(e.status),
    startTime: str(e.start_time),
    endTime: str(e.end_time),
  }));
}

/** Invités d'un RDV (prospect : nom + email). */
export function getEventInvitees(
  eventUri: string,
  accessToken?: string,
): Promise<CalendlyInvitee[]> {
  // eventUri = https://api.calendly.com/scheduled_events/{uuid}
  const uuid = eventUri.split('/').pop() ?? '';
  if (!uuid) return Promise.resolve([]);
  // Les invités d'un RDV ne changent qu'à une reprogrammation : 5 min de
  // mémoire évitent ~40 appels Calendly à chaque affichage de l'agenda.
  return cached(`calendly:invitees:${uuid}`, CALENDLY_CACHE_MS, () =>
    getEventInviteesUncached(uuid, accessToken),
  );
}

async function getEventInviteesUncached(
  uuid: string,
  accessToken?: string,
): Promise<CalendlyInvitee[]> {
  const data = await call(`/scheduled_events/${uuid}/invitees?count=10`, accessToken);
  const collection = isRecord(data) && Array.isArray(data.collection) ? data.collection : [];
  return collection.filter(isRecord).map((i) => ({
    name: str(i.name),
    email: str(i.email),
    status: str(i.status),
    // `no_show` est un objet (uri…) quand l'invité est marqué absent, sinon null.
    noShow: i.no_show != null,
    rescheduled: i.rescheduled === true,
    phone: extractInviteePhone(i),
  }));
}

/**
 * Téléphone de l'invité, si Calendly le connaît : le numéro de rappel SMS
 * (`text_reminder_number`), sinon une réponse du formulaire dont la question
 * parle de téléphone. Best-effort — null si rien d'exploitable.
 */
function extractInviteePhone(invitee: Record<string, unknown>): string | null {
  const direct = str(invitee.text_reminder_number).trim();
  if (direct) return direct;
  const qa = Array.isArray(invitee.questions_and_answers) ? invitee.questions_and_answers : [];
  for (const entry of qa) {
    if (!isRecord(entry)) continue;
    const question = str(entry.question);
    const answer = str(entry.answer).trim();
    if (answer && /t[ée]l[ée]phone|portable|phone|num[ée]ro/i.test(question)) return answer;
  }
  return null;
}

export function isCalendlyConfigured(): boolean {
  return Boolean(process.env.CALENDLY_TOKEN);
}
