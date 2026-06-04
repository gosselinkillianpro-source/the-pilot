import type { NextRequest } from 'next/server';
import { runSahSync } from '@/lib/integrations/sah/sync';

/**
 * Déclencheur de synchronisation SAH (appelé par le cron Render toutes les 5 min).
 *
 * Endpoint PUBLIC (appelé par un planificateur externe) MAIS protégé par un secret
 * partagé : l'URL doit contenir ?token=<CRON_SECRET> (ou header x-cron-token).
 * Fail-closed : si le secret n'est pas configuré côté serveur, on refuse tout.
 *
 * La requête SAH part de CE service web (IP dédiées whitelistées par SAH). Le cron
 * ne fait que déclencher : il n'a pas besoin d'accéder à SAH lui-même.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // la synchro (souscriptions incluses) peut être longue

// Garde anti-chevauchement : évite deux synchros simultanées sur la même instance.
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

  running = true;
  const startedAt = Date.now();
  try {
    const result = await runSahSync();
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
