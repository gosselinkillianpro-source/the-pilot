import 'server-only';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto/hash';
import { sources } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';

/**
 * Authentification du webhook de réception : `X-Source-Key` = secret de la
 * source. Comparaison en temps constant. Limitation de débit en mémoire par
 * (source, IP) : suffisante pour un pilote mono-instance, à remplacer par un
 * store partagé si l'app passe en multi-instance.
 */
export type SourceRow = typeof sources.$inferSelect;

export async function authenticateSource(req: NextRequest): Promise<SourceRow | null> {
  const key = req.headers.get('x-source-key');
  if (!key) return null;
  const all = await asSystem((tx) => tx.select().from(sources).where(eq(sources.active, true)));
  for (const s of all) {
    if (safeEqual(s.webhookSecret, key)) return s;
  }
  return null;
}

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-client-ip') ?? req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first && /^[0-9a-fA-F:.]+$/.test(first)) return first;
  return null;
}

export function clientUserAgent(req: NextRequest): string | null {
  return req.headers.get('x-client-ua') ?? req.headers.get('user-agent');
}
