import type { NextRequest } from 'next/server';
import { runGamificationSweep } from '@/lib/closing/gamification/engine';

/**
 * Balayage gamification — toutes les 5 minutes.
 *
 * Décerne les badges gagnés, transforme les souscriptions attribuées en
 * événements du fil d'activité, annonce les victoires à l'équipe (Telegram)
 * et pousse le signal temps réel qui rafraîchit le classement ouvert.
 *
 * Tout est rejouable : l'unicité (badge par semaine, événement par souscription)
 * vit en base — un passage doublé n'annonce rien deux fois.
 *
 * Même protection que les autres crons : secret partagé en query ou en en-tête,
 * fail-closed si le secret n'est pas configuré côté serveur.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Anti-chevauchement : deux passages simultanés créeraient des annonces en double.
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
    const result = await runGamificationSweep();
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
