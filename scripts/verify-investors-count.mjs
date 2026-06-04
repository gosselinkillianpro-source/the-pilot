import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('NO_DATABASE_URL');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, connect_timeout: 15 });
try {
  const rows = await sql`
    select
      count(*) as total,
      count(*) filter (where not registration_complete and not onboarding_complete) as inscrits,
      count(*) filter (where registration_complete and not onboarding_complete) as profil_seul,
      count(*) filter (where registration_complete and onboarding_complete) as complets,
      count(*) filter (where not registration_complete and onboarding_complete) as incoherent
    from investors
  `;
  console.log(JSON.stringify(rows[0], null, 2));
} catch (e) {
  console.log('DB_ERROR_CODE:', e.code ?? 'n/a');
  console.log('DB_ERROR_MSG:', (e.message ?? String(e)).replace(/:[^:@/\s]+@/g, ':****@'));
} finally {
  await sql.end({ timeout: 5 });
}
