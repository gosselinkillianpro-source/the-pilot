/**
 * Crée / met à jour le rôle applicatif `app_lead` (drizzle/roles.sql).
 *
 * Usage :
 *   APP_LEAD_PASSWORD='…' node --env-file=apps/lead/.env.local apps/lead/scripts/apply-roles.mjs
 *
 * Nécessite DATABASE_ADMIN_URL (rôle postgres). Imprime ensuite la DATABASE_URL
 * à utiliser pour l'application (mot de passe masqué).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const out = (s) => process.stdout.write(`${s}\n`);

const here = dirname(fileURLToPath(import.meta.url));
const adminUrl = process.env.DATABASE_ADMIN_URL;
const password = process.env.APP_LEAD_PASSWORD;

if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL manquante (rôle postgres).');
  process.exit(1);
}
if (!password || password.length < 24) {
  console.error(
    'APP_LEAD_PASSWORD manquant ou trop court (24 caractères minimum). `openssl rand -base64 32`',
  );
  process.exit(1);
}

const sql = postgres(adminUrl, { prepare: false, connect_timeout: 20 });
try {
  const raw = readFileSync(join(here, '..', 'drizzle', 'roles.sql'), 'utf8');
  // psql n'est pas là pour substituer :'app_lead_password' : on le fait ici, échappé.
  const content = raw.replace(":'app_lead_password'", `'${password.replace(/'/g, "''")}'`);
  await sql.unsafe(content);
  const [role] = await sql`select rolbypassrls, rolsuper from pg_roles where rolname = 'app_lead'`;
  out(`ROLE_OK bypassrls=${role?.rolbypassrls} superuser=${role?.rolsuper}`);
  const u = new URL(adminUrl);
  u.username = 'app_lead';
  u.password = '****';
  out(`DATABASE_URL à utiliser pour l'app : ${u.toString()}`);
} catch (e) {
  console.error('ROLE_ERROR:', (e.message ?? String(e)).replace(/:[^:@/\s]+@/g, ':****@'));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
