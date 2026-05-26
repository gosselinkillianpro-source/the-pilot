import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set — DB queries will fail at runtime');
}

const queryClient = postgres(connectionString ?? '', {
  prepare: false,
  max: 10,
});

export const db = drizzle(queryClient);
export type DrizzleClient = typeof db;
