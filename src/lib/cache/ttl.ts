import 'server-only';

/**
 * Cache mémoire à durée de vie, côté serveur — pour les APPELS EXTERNES
 * (Meta, Calendly) et les lectures peu volatiles.
 *
 * Pourquoi : chaque affichage de /ads refaisait 6 appels Meta, chaque
 * affichage de /rdv jusqu'à 40 appels Calendly — et LiveSync relance un rendu
 * serveur toutes les 60 s. Ces données bougent à l'échelle de la minute, pas
 * de la seconde : les servir depuis la mémoire quelques minutes rend les pages
 * quasi instantanées sans rien changer aux chiffres affichés.
 *
 * - Singleton via globalThis (survit au HMR en dev, une instance sur Render).
 * - Les appels concurrents sur une même clé partagent la même promesse.
 * - Une erreur n'est jamais mise en cache.
 * - Taille bornée : purge paresseuse des entrées expirées.
 */

type Entry = { expiresAt: number; value: unknown };

type Store = {
  entries: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
};

const globalForCache = globalThis as unknown as { __pilotTtlCache?: Store };
const store: Store = globalForCache.__pilotTtlCache ?? {
  entries: new Map(),
  inflight: new Map(),
};
globalForCache.__pilotTtlCache = store;

const MAX_ENTRIES = 500;

function purgeExpired(now: number): void {
  if (store.entries.size < MAX_ENTRIES) return;
  for (const [key, entry] of store.entries) {
    if (entry.expiresAt <= now) store.entries.delete(key);
  }
}

/** Renvoie la valeur en cache pour `key`, sinon exécute `fn` et mémorise `ttlMs`. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.entries.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = store.inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fn()
    .then((value) => {
      purgeExpired(now);
      store.entries.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => {
      store.inflight.delete(key);
    });
  store.inflight.set(key, promise);
  return promise;
}

/** Oublie toutes les entrées dont la clé commence par `prefix` (après une écriture, par ex.). */
export function invalidateCache(prefix: string): void {
  for (const key of store.entries.keys()) {
    if (key.startsWith(prefix)) store.entries.delete(key);
  }
}

/** Arrondit un instant au multiple de `stepMs` inférieur — pour des clés de cache stables. */
export function bucketTime(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}
