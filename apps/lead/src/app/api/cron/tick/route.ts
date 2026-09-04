import type { NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto/hash';
import { optionalEnv } from '@/lib/env';
import { ensureJobsRegistered } from '@/lib/jobs';
import { countOverdueJobs, runDueJobs } from '@/lib/jobs/queue';

/**
 * Tick des jobs — appelé chaque minute par le cron Render (scripts/cron-call.mjs).
 * Secret partagé en query ou en en-tête, fail-closed si non configuré.
 * Anti-chevauchement en mémoire : deux ticks simultanés dans le même process
 * ne se marchent pas dessus (la base a de toute façon SKIP LOCKED).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 55;

let running = false;

async function handle(req: NextRequest): Promise<Response> {
  const secret = optionalEnv('CRON_SECRET');
  if (!secret)
    return Response.json({ ok: false, error: 'CRON_SECRET non configuré' }, { status: 503 });
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-cron-token') ?? '';
  if (!safeEqual(token, secret))
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (running) return Response.json({ ok: true, skipped: 'déjà en cours' });
  running = true;
  const startedAt = Date.now();
  try {
    ensureJobsRegistered();
    const result = await runDueJobs({ limit: 100 });
    const overdue = await countOverdueJobs();
    return Response.json({ ok: true, durationMs: Date.now() - startedAt, overdue, ...result });
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
