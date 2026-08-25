import 'server-only';

/**
 * Client WebinarGeek API v2 — LECTURE SEULE.
 *
 * Remplace l'export CSV manuel des « abonnés » : l'endpoint `/subscriptions`
 * renvoie tout ce que contenait le fichier, et davantage (durée de visionnage,
 * CTA cliqués, réponses aux sondages, consentements du formulaire).
 *
 * Auth : header `Api-Token` (clé dans les paramètres avancés du compte).
 * Limites : 300 req/min, 5 000/h, 25 000/jour sur un compte payant — très
 * au-dessus de nos besoins (1 000 inscrits par page, donc un webinaire tient
 * en général en une seule requête).
 *
 * Docs : https://static.webinargeek.com/api-documentation.html
 */

const API_BASE = 'https://app.webinargeek.com/api/v2';
const MAX_PER_PAGE = 1000;
/** Garde-fou : au-delà, on soupçonne une boucle de pagination. */
const MAX_PAGES = 50;

export class WebinarGeekError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WebinarGeekError';
    this.status = status;
  }
}

export function isWebinarGeekConfigured(): boolean {
  return Boolean(process.env.WEBINARGEEK_API_TOKEN);
}

function token(): string {
  const t = process.env.WEBINARGEEK_API_TOKEN;
  if (!t) throw new WebinarGeekError('WEBINARGEEK_API_TOKEN non configuré');
  return t;
}

/* --- Lecture sûre : la réponse externe est `unknown` jusqu'à preuve du contraire --- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
/** WebinarGeek horodate en secondes UNIX. */
function ts(v: unknown): Date | null {
  const n = num(v);
  return n != null && n > 0 ? new Date(n * 1000) : null;
}
function json(v: unknown): unknown {
  return v === undefined ? null : v;
}

async function call(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Api-Token': token(), Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (e) {
    throw new WebinarGeekError(
      `WebinarGeek injoignable : ${e instanceof Error ? e.message : 'erreur réseau'}`,
    );
  }

  if (res.status === 429) {
    throw new WebinarGeekError('Limite de débit WebinarGeek atteinte', 429);
  }
  if (!res.ok) {
    throw new WebinarGeekError(`WebinarGeek a répondu ${res.status} ${res.statusText}`, res.status);
  }
  return res.json();
}

/* ============================================================
   BROADCASTS — une diffusion = une session de webinaire
   ============================================================ */

export type WgBroadcast = {
  id: string;
  webinarId: string | null;
  title: string;
  startsAt: Date | null;
  durationMinutes: number | null;
};

function parseBroadcast(raw: unknown): WgBroadcast | null {
  if (!isRecord(raw)) return null;
  const id = raw.id != null ? String(raw.id) : null;
  if (!id) return null;

  // Le titre peut vivre sur la diffusion ou sur le webinaire parent.
  const webinar = isRecord(raw.webinar) ? raw.webinar : null;
  const title = str(raw.title) ?? (webinar ? str(webinar.title) : null) ?? `Webinaire ${id}`;

  return {
    id,
    webinarId:
      raw.webinar_id != null
        ? String(raw.webinar_id)
        : webinar?.id != null
          ? String(webinar.id)
          : null,
    title,
    startsAt: ts(raw.starts_at) ?? ts(raw.start_time) ?? ts(raw.scheduled_at),
    durationMinutes: num(raw.duration) ?? num(raw.duration_minutes),
  };
}

export async function listBroadcasts(limit = 50): Promise<WgBroadcast[]> {
  const data = await call(`/broadcasts?per_page=${Math.min(limit, MAX_PER_PAGE)}`);
  const collection = isRecord(data)
    ? Array.isArray(data.broadcasts)
      ? data.broadcasts
      : Array.isArray(data.data)
        ? data.data
        : []
    : Array.isArray(data)
      ? data
      : [];
  return collection.map(parseBroadcast).filter((b): b is WgBroadcast => b !== null);
}

/* ============================================================
   SUBSCRIPTIONS — un inscrit et TOUT son engagement
   ============================================================ */

export type WgSubscription = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  /** Identifiant que NOUS avons posé côté WebinarGeek — lien CRM sans ambiguïté. */
  externalId: string | null;

  // Engagement
  watched: boolean;
  watchedLive: boolean;
  watchedReplay: boolean;
  watchDurationS: number | null;
  watchDurationReplayS: number | null;
  watchStart: Date | null;
  watchEnd: Date | null;

  // Réponses et actions, conservées brutes
  extraFields: unknown;
  consentFields: unknown;
  pollVotes: unknown;
  quizAnswers: unknown;
  evaluationAnswers: unknown;
  callsToAction: unknown;
  questions: unknown;

  unsubscribed: boolean;
  registeredAt: Date | null;
};

function parseSubscription(raw: unknown): WgSubscription | null {
  if (!isRecord(raw)) return null;
  const id = raw.id != null ? String(raw.id) : null;
  const email = str(raw.email);
  // Sans e-mail on ne peut ni rattacher ni recontacter : la ligne est inutile.
  if (!id || !email) return null;

  return {
    id,
    email: email.toLowerCase(),
    firstName: str(raw.firstname),
    lastName: str(raw.surname),
    phone: str(raw.phone),
    company: str(raw.company),
    jobTitle: str(raw.job_title),
    externalId: str(raw.external_id),

    watched: bool(raw.watched),
    watchedLive: bool(raw.watched_live),
    watchedReplay: bool(raw.watched_replay),
    watchDurationS: num(raw.watch_duration),
    watchDurationReplayS: num(raw.watch_duration_replay),
    watchStart: ts(raw.watch_start),
    watchEnd: ts(raw.watch_end),

    extraFields: json(raw.extra_fields),
    consentFields: json(raw.consent_fields),
    pollVotes: json(raw.poll_votes),
    quizAnswers: json(raw.quiz_answers),
    evaluationAnswers: json(raw.evaluation_form_answers),
    callsToAction: json(raw.calls_to_action),
    questions: json(raw.questions),

    unsubscribed: bool(raw.unsubscribed),
    registeredAt: ts(raw.created_at),
  };
}

/**
 * Tous les inscrits d'une diffusion, pagination suivie jusqu'au bout.
 * C'est l'équivalent exact de l'export CSV « abonnés », en automatique.
 */
export async function listSubscriptions(broadcastId: string): Promise<WgSubscription[]> {
  const out: WgSubscription[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await call(
      `/subscriptions?broadcast_id=${encodeURIComponent(broadcastId)}&per_page=${MAX_PER_PAGE}&page=${page}`,
    );
    const collection = isRecord(data)
      ? Array.isArray(data.subscriptions)
        ? data.subscriptions
        : Array.isArray(data.data)
          ? data.data
          : []
      : Array.isArray(data)
        ? data
        : [];

    for (const item of collection) {
      const sub = parseSubscription(item);
      if (sub) out.push(sub);
    }

    // Page incomplète = dernière page.
    if (collection.length < MAX_PER_PAGE) break;
  }

  return out;
}
