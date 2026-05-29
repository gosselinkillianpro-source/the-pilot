import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set — DB queries will fail at runtime');
}

/**
 * Client postgres réutilisé entre les rechargements à chaud (HMR) en dev.
 * Sans ce singleton, chaque hot-reload crée un nouveau pool et sature le pooler
 * Supabase (erreur EMAXCONNSESSION : max clients reached). Pool volontairement
 * petit + libération des connexions idle pour rester sous la limite du pooler.
 */
const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };

const queryClient =
  globalForDb.__pgClient ??
  postgres(connectionString ?? '', {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgClient = queryClient;
}

export const db = drizzle(queryClient);
export type DrizzleClient = typeof db;
