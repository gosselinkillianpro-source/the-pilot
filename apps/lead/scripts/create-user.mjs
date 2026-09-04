/**
 * Crée un compte interne The Pilot Lead (admin ou setter) : compte Supabase Auth
 * du projet DÉDIÉ + ligne lead.users. Les acheteurs, eux, sont invités depuis
 * l'écran Acheteurs (lien magique), jamais par ce script.
 *
 * Usage :
 *   node --env-file=apps/lead/.env.local apps/lead/scripts/create-user.mjs <email> <mot_de_passe> [admin|setter] [nom]
 */
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const out = (s) => process.stdout.write(`${s}\n`);

const [, , email, password, roleArg = 'admin', name = ''] = process.argv;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminDb = process.env.DATABASE_ADMIN_URL;

if (!url || !serviceKey || !adminDb) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et DATABASE_ADMIN_URL sont requis.',
  );
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage : create-user.mjs <email> <mot_de_passe> [admin|setter] [nom]');
  process.exit(1);
}
if (!['admin', 'setter'].includes(roleArg)) {
  console.error('Rôle invalide : admin ou setter.');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Mot de passe trop court (10 caractères minimum).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { app: 'lead', role: roleArg },
  user_metadata: { name },
});
if (error) {
  console.error('AUTH_ERROR:', error.message);
  process.exit(1);
}

const sql = postgres(adminDb, { prepare: false, connect_timeout: 20 });
try {
  await sql`
    insert into lead.users (id, email, name, role, on_duty, active)
    values (${data.user.id}::uuid, ${email}, ${name || null}, ${roleArg}::lead.user_role, ${roleArg === 'admin'}, true)
    on conflict (id) do update set email = excluded.email, role = excluded.role, name = coalesce(excluded.name, lead.users.name)
  `;
  out(`USER_OK ${email} (${roleArg}) id=${data.user.id}`);
} finally {
  await sql.end({ timeout: 5 });
}
