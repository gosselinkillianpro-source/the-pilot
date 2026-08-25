import type { NextRequest } from 'next/server';
import { syncWebinars } from '@/lib/webinars/sync';

/**
 * Synchronisation WebinarGeek (appelée par un cron Render).
 *
 * Remplace l'export CSV manuel des « abonnés » : récupère les diffusions
 * récentes, leurs inscrits, leur engagement, crée une fiche contact par
 * personne et la relie à sa fiche investisseur SAH quand l'e-mail correspond.
 *
 * Endpoint PUBLIC mais protégé par le même secret partagé que la synchro SAH :
 * l'URL doit contenir ?token=<CRON_SECRET> (ou header x-cron-token).
 * Fail-closed : sans secret configuré côté serveur, on refuse tout.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Garde anti-chevauchement : deux synchros simultanées se marcheraient dessus. */
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
    return Response.json({ ok: true, skipped: 'déjà en cours' }, { status: 200 });
  }

  const startedAt = Date.now();
  running = true;
  try {
    const result = await syncWebinars();
    return Response.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'erreur inconnue' },
      { status: 500 },
    );
  } finally {
    running = false;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
