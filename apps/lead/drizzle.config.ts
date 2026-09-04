import { defineConfig } from 'drizzle-kit';

/**
 * Migrations avec le rôle `postgres` (DATABASE_ADMIN_URL) : c'est lui qui
 * possède le schéma `lead`. L'application, elle, se connecte avec `app_lead`
 * (DATABASE_URL), un rôle SANS bypass RLS — voir drizzle/roles.sql.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  schemaFilter: ['lead'],
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
