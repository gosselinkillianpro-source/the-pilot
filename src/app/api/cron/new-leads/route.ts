import type { NextRequest } from 'next/server';
import { notifyNewLeads } from '@/lib/leads/notify-new-leads';

/**
 * Détecteur de nouveaux leads BREACH — toutes les 2 minutes.
 *
 * Un lead rappelé dans les 5 minutes convertit bien mieux qu'un lead rappelé
 * le lendemain. La synchro générale tourne au quart d'heure : trop lent pour
 * cette fenêtre, d'où ce passage court et ciblé qui ne regarde QUE les
 * inscriptions des dernières minutes.
 *
 * Même protection que les autres crons : secret partagé en query ou en en-tête,
 * fail-closed si le secret n'est pas configuré côté serveur.
 *
 * ⚠️ Le webhook SAH (`/api/webhooks/sah`, prévu mais pas encore implémenté des
 * deux côtés) rendra ce cron secondaire le jour où SAH appellera THE PILOT à
 * l'inscription : il deviendra alors le filet de sécurité des webhooks perdus.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Anti-chevauchement : deux passages simultanés enverraient l'alerte en double.
let running = false;

async function handle(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: 'CRON_SECRET non configuré' }, { status: 503 });
  }
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-cron-token') ?? '';
  if (token !== secret) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (running) {
    return Response.json({ ok: true, skipped: 'déjà en cours' });
  }
  running = true;
  const startedAt = Date.now();
  try {
    const result = await notifyNewLeads();
    return Response.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  } finally {
    running = false;
  }
}

export const GET = handle;
export const POST = handle;
