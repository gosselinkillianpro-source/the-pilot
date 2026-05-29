import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('NO_DATABASE_URL');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, connect_timeout: 20 });
try {
  const content = readFileSync('drizzle/policies.sql', 'utf8');
  await sql.unsafe(content);
  console.log('RLS_APPLIED');

  // Vérif : RLS activée sur chaque table + nombre de policies
  const rows = await sql`
    select t.tablename,
           t.rowsecurity as rls_on,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) as policies
    from pg_tables t
    where t.schemaname = 'public'
    order by t.tablename
  `;
  for (const r of rows) {
    console.log(`${r.tablename} : RLS=${r.rls_on} policies=${r.policies}`);
  }
} catch (e) {
  console.log('RLS_ERROR:', (e.message ?? String(e)).replace(/:[^:@/\s]+@/g, ':****@'));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
