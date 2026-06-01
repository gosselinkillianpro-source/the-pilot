import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { emailEvents } from '@/lib/db/schema';

/**
 * Webhook Brevo : reçoit les événements email (livré, ouvert, cliqué, bounce…)
 * et les stocke dans `email_events` pour alimenter le scoring et l'activité contact.
 *
 * Endpoint PUBLIC (Brevo n'est pas authentifié chez nous) MAIS protégé par un
 * secret partagé : l'URL configurée dans Brevo doit contenir ?token=<BREVO_WEBHOOK_SECRET>.
 * Fail-closed : si le secret n'est pas configuré côté serveur, on refuse tout.
 */

type BrevoEvent = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
}

function pickMessageId(e: BrevoEvent): string | null {
  return str(e['message-id']) ?? str(e.messageId) ?? str(e.id);
}

function pickOccurredAt(e: BrevoEvent): Date | null {
  const date = str(e.date);
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof e.ts === 'number') {
    const d = new Date(e.ts * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Vérification du secret (query ?token= ou header x-webhook-token)
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook secret non configuré', { status: 503 });
  }
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-webhook-token') ?? '';
  if (token !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parsing du corps (Brevo envoie un objet, parfois un tableau)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const events: BrevoEvent[] = Array.isArray(body) ? (body as BrevoEvent[]) : [body as BrevoEvent];

  // 3. Insertion (best-effort, on ne bloque jamais Brevo)
  const rows = events
    .filter((e) => str(e.email) && str(e.event))
    .map((e) => ({
      messageId: pickMessageId(e),
      email: str(e.email) ?? '',
      event: str(e.event) ?? '',
      subject: str(e.subject),
      link: str(e.link),
      tag: str(e.tag),
      occurredAt: pickOccurredAt(e),
      payload: e,
    }));

  if (rows.length > 0) {
    try {
      await db.insert(emailEvents).values(rows);
    } catch (err) {
      // On log mais on renvoie 200 : sinon Brevo réessaie en boucle.
      console.error('brevo webhook insert failed:', err instanceof Error ? err.message : err);
    }
  }

  return new Response(JSON.stringify({ received: rows.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
