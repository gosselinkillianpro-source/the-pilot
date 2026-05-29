// Découverte du compte Brevo : volumes + structure (sans dumper les données perso)
const key = process.env.BREVO_API_KEY;
if (!key) {
  console.log('NO_BREVO_KEY');
  process.exit(1);
}

const base = 'https://api.brevo.com/v3';
const headers = { 'api-key': key, accept: 'application/json' };

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) return { __error: res.status };
  return res.json();
}

function maskEmail(e) {
  if (!e || typeof e !== 'string' || !e.includes('@')) return e;
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

const account = await get('/account');
console.log('=== COMPTE ===');
console.log('email:', maskEmail(account.email), '| societe:', account.companyName);
if (account.plan) {
  for (const p of account.plan) console.log(`plan: ${p.type} | credits: ${p.credits ?? 'n/a'}`);
}

const contacts = await get('/contacts?limit=1');
console.log('\n=== CONTACTS ===');
console.log('total contacts:', contacts.count ?? contacts.__error ?? 'n/a');
if (contacts.contacts?.[0]) {
  console.log(
    'attributs dispo sur un contact:',
    Object.keys(contacts.contacts[0].attributes ?? {}).join(', ') || '(aucun)',
  );
  console.log('champs contact:', Object.keys(contacts.contacts[0]).join(', '));
}

const lists = await get('/contacts/lists?limit=50');
console.log('\n=== LISTES ===');
console.log('total listes:', lists.count ?? 'n/a');
for (const l of (lists.lists ?? []).slice(0, 15)) {
  console.log(`  - [${l.id}] ${l.name} : ${l.totalSubscribers ?? 0} contacts`);
}

const campaigns = await get('/emailCampaigns?limit=10&sort=desc');
console.log('\n=== CAMPAGNES EMAIL ===');
console.log('total campagnes:', campaigns.count ?? campaigns.__error ?? 'n/a');
for (const c of (campaigns.campaigns ?? []).slice(0, 10)) {
  const s = c.statistics?.globalStats ?? {};
  console.log(
    `  - [${c.status}] ${c.name} | envois:${s.sent ?? 0} ouv:${s.uniqueViews ?? s.viewed ?? 0} clics:${s.uniqueClicks ?? s.clickers ?? 0}`,
  );
}

const tx = await get('/smtp/statistics/aggregatedReport');
console.log('\n=== EMAILS TRANSACTIONNELS (agrege) ===');
if (tx.__error) {
  console.log('non dispo (', tx.__error, ')');
} else {
  console.log(
    `envois:${tx.requests ?? 0} livres:${tx.delivered ?? 0} ouv:${tx.opens ?? 0} clics:${tx.clicks ?? 0}`,
  );
}
