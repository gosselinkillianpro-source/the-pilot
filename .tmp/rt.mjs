import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, connect_timeout: 15 });
const pubs = await sql`select pubname from pg_publication`;
console.log('publications :', pubs.map(p=>p.pubname).join(', ') || '(aucune)');
const tables = await sql`select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime'`;
console.log('tables publiées en realtime :', tables.map(t=>t.tablename).join(', ') || '(aucune)');
console.log('\npolicies par table :');
console.table(await sql`select tablename, count(*)::int policies, bool_or(rowsecurity) rls
  from pg_policies p right join pg_tables t using (tablename)
  where t.schemaname='public' and tablename in ('investors','rdv_contacts','interactions','closer_tasks','users','webinar_registrations')
  group by tablename order by tablename`);
await sql.end({timeout:5});
