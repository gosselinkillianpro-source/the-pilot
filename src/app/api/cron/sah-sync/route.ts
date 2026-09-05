import type { NextRequest } from 'next/server';
import { refreshCalendlyContacts } from '@/lib/integrations/calendly/refresh';
import { runSahSync, type SyncScope } from '@/lib/integrations/sah/sync';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

const SCOPES: SyncScope[] = ['light', 'subscriptions', 'full'];

/**
 * Déclencheur de synchronisation SAH (appelé par les crons Render).
 * ?scope=light (défaut) : projets + investisseurs (toutes les 15 min).
 * ?scope=subscriptions : nouvelles souscriptions seulement (toutes les heures).
 * ?scope=full : tout, upsert complet (bouton manuel).
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

  const scopeParam = req.nextUrl.searchParams.get('scope');
  const scope: SyncScope = SCOPES.includes(scopeParam as SyncScope)
    ? (scopeParam as SyncScope)
    : 'light';

  running = true;
  const startedAt = Date.now();
  try {
    const result = await runSahSync(scope);
    // Rendez-vous Calendly : fiches à jour au même rythme (15 min), pour que le
    // pool des closers ne propose jamais quelqu'un que Guillaume suit déjà.
    // Best-effort : un agenda en erreur ne fait pas échouer la synchro.
    const calendly = scope === 'light' ? await refreshCalendlyContacts() : null;
    // Les écrans ouverts se mettent à jour sans que personne n'ait à recharger.
    await notifyChange(SYNC_TOPICS.sah);
    return Response.json({
      ok: true,
      scope,
      durationMs: Date.now() - startedAt,
      ...result,
      calendly,
    });
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
