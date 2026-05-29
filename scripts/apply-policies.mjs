// Applique drizzle/policies.sql à la base (idempotent). Usage : DATABASE_URL=... node scripts/apply-policies.mjs
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquante');
  process.exit(1);
}
const sql = readFileSync('drizzle/policies.sql', 'utf8');
const client = postgres(url, { prepare: false, max: 1 });
try {
  await client.unsafe(sql);
  console.log('✓ Policies RLS appliquées');
} catch (e) {
  console.error('✗ Erreur policies:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
