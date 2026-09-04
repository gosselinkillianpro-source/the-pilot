import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Connexion applicative : rôle `app_lead`, SANS bypass RLS (drizzle/roles.sql).
 * Toute requête métier passe par `withDbSession` (./session.ts) qui pose le
 * rôle et le périmètre de la requête dans la transaction : c'est la base qui
 * filtre, quoi que fasse le code.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[lead] DATABASE_URL absente — les requêtes échoueront à l’exécution');
}

const globalForDb = globalThis as unknown as { __leadPgClient?: ReturnType<typeof postgres> };

const queryClient =
  globalForDb.__leadPgClient ??
  postgres(connectionString ?? '', {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__leadPgClient = queryClient;
}

export const db = drizzle(queryClient);
export type DrizzleClient = typeof db;
