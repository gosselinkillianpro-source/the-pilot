import { headers } from 'next/headers';

/**
 * Protection anti-force-brute du login (V0).
 * Compteur en mémoire par (email + IP) : au-delà de MAX_FAILED_ATTEMPTS échecs,
 * la connexion est bloquée pendant LOCKOUT_MS. Réinitialisé à la première réussite.
 *
 * Limite connue : la mémoire est par-instance de serveur. En production multi-instance
 * (Vercel), il faudra un store partagé (Redis/Upstash) ou s'appuyer sur les limites
 * d'auth Supabase + Cloudflare. Suffisant pour le mono-instance / dev.
 */
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

type Entry = { failures: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

async function clientKey(email: string): Promise<string> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'ip-inconnue';
  return `${email.trim().toLowerCase()}|${ip}`;
}

function prune(now: number): void {
  // Garde-fou mémoire : purge les entrées dont le verrou est expiré.
  if (attempts.size < 5000) return;
  for (const [k, e] of attempts) {
    if (e.lockedUntil < now) attempts.delete(k);
  }
}

export type RateState = { blocked: boolean; retryAfterSec: number; remaining: number };

/** À appeler AVANT de tenter l'authentification. */
export async function checkLoginAllowed(email: string): Promise<RateState> {
  const key = await clientKey(email);
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && entry.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
      remaining: 0,
    };
  }
  // Verrou expiré → on repart à zéro.
  if (entry && entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    attempts.delete(key);
    return { blocked: false, retryAfterSec: 0, remaining: MAX_FAILED_ATTEMPTS };
  }

  const failures = entry?.failures ?? 0;
  return {
    blocked: false,
    retryAfterSec: 0,
    remaining: Math.max(0, MAX_FAILED_ATTEMPTS - failures),
  };
}

/** À appeler après un échec d'authentification. Renvoie l'état (bloqué ? essais restants ?). */
export async function recordLoginFailure(email: string): Promise<RateState> {
  const key = await clientKey(email);
  const now = Date.now();
  prune(now);
  const entry = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;

  if (entry.failures >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.failures = 0;
    attempts.set(key, entry);
    return { blocked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000), remaining: 0 };
  }

  attempts.set(key, entry);
  return { blocked: false, retryAfterSec: 0, remaining: MAX_FAILED_ATTEMPTS - entry.failures };
}

/** À appeler après une connexion réussie : remet le compteur à zéro. */
export async function recordLoginSuccess(email: string): Promise<void> {
  attempts.delete(await clientKey(email));
}
