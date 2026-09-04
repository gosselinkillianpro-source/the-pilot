/**
 * Applique drizzle/policies.sql (RLS) avec le rôle postgres, puis vérifie que
 * chaque table du schéma lead a la RLS activée ET au moins une politique.
 *
 * Usage : node --env-file=apps/lead/.env.local apps/lead/scripts/apply-policies.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const out = (s) => process.stdout.write(`${s}\n`);

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error('DATABASE_ADMIN_URL manquante (rôle postgres).');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, connect_timeout: 20 });
try {
  await sql.unsafe(readFileSync(join(here, '..', 'drizzle', 'policies.sql'), 'utf8'));
  out('RLS_APPLIED');
  const rows = await sql`
    select t.tablename,
           t.rowsecurity as rls_on,
           c.relforcerowsecurity as forced,
           (select count(*) from pg_policies p where p.schemaname = 'lead' and p.tablename = t.tablename) as policies
    from pg_tables t
    join pg_class c on c.relname = t.tablename
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
    where t.schemaname = 'lead'
    order by t.tablename
  `;
  let ok = true;
  for (const r of rows) {
    const line = `${r.tablename.padEnd(24)} RLS=${r.rls_on} forced=${r.forced} policies=${r.policies}`;
    if (!r.rls_on || !r.forced || Number(r.policies) === 0) {
      ok = false;
      out(`⚠️  ${line}`);
    } else {
      out(`   ${line}`);
    }
  }
  if (!ok) {
    console.error('Au moins une table sans RLS complète : STOP.');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('RLS_ERROR:', (e.message ?? String(e)).replace(/:[^:@/\s]+@/g, ':****@'));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
