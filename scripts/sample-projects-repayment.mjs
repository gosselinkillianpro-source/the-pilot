import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, connect_timeout: 15 });
try {
  const rows = await sql`
    select p.name, p.status, p.duration_months,
      p.opened_at, p.expected_completion_at, p.repayment_date,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as collected
    from projects p
    left join subscriptions s on s.project_id = p.id
    group by p.id
    order by p.status, p.repayment_date desc nulls last
  `;
  const withDate = rows.filter((r) => r.repayment_date).length;
  console.log(`Projets: ${rows.length} · avec date de remboursement: ${withDate}`);
  console.log('');
  // Un échantillon par statut
  const byStatus = {};
  for (const r of rows) (byStatus[r.status] ??= []).push(r);
  for (const [status, list] of Object.entries(byStatus)) {
    console.log(`=== ${status} (${list.length}) ===`);
    for (const r of list.slice(0, 4)) {
      const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '—');
      console.log(
        `  ${(r.name ?? '').slice(0, 32).padEnd(32)} | ouvert ${d(r.opened_at)} | clôture ${d(r.expected_completion_at)} | REMB ${d(r.repayment_date)} | ${Math.round(Number(r.collected)).toLocaleString('fr-FR')}€`,
      );
    }
  }
} catch (e) {
  console.log('ERR', e.message);
} finally {
  await sql.end({ timeout: 5 });
}
