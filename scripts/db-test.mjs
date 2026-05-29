import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('NO_DATABASE_URL');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, connect_timeout: 15 });
try {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log('DB_OK — tables:', tables.map((t) => t.table_name).join(', '));
} catch (e) {
  console.log('DB_ERROR_CODE:', e.code ?? 'n/a');
  console.log('DB_ERROR_MSG:', (e.message ?? String(e)).replace(/:[^:@/\s]+@/g, ':****@'));
} finally {
  await sql.end({ timeout: 5 });
}
