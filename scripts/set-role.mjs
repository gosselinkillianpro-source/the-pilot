/**
 * Change le rôle d'un compte THE PILOT existant.
 *
 * Usage :
 *   node --env-file=.env.local scripts/set-role.mjs <email> <role>
 *
 * role : admin | closer | closer_junior | executive
 *
 * Met à jour app_metadata.role (barrière de permission lue par le JWT)
 * ET public.users.role (affichage / équipe). Réversible : relancer avec l'ancien rôle.
 */
import { createClient } from '@supabase/supabase-js';

const VALID_ROLES = ['admin', 'closer', 'closer_junior', 'executive'];
const MFA_ROLES = ['admin', 'closer', 'closer_junior'];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('ERREUR : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');
  process.exit(1);
}

const [, , email, role] = process.argv;
if (!email || !role) {
  console.error('Usage : node --env-file=.env.local scripts/set-role.mjs <email> <role>');
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`Rôle invalide : "${role}". Valeurs : ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Retrouve l'utilisateur par email (pagination défensive).
let target = null;
for (let page = 1; page <= 20 && !target; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('ÉCHEC listUsers :', error.message);
    process.exit(1);
  }
  target = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
}
if (!target) {
  console.error(`Aucun compte trouvé pour ${email}.`);
  process.exit(1);
}

const prevRole = target.app_metadata?.role ?? '(aucun)';

const { error: authErr } = await admin.auth.admin.updateUserById(target.id, {
  app_metadata: { ...target.app_metadata, role },
});
if (authErr) {
  console.error('ÉCHEC mise à jour app_metadata :', authErr.message);
  process.exit(1);
}

const { error: dbErr } = await admin.from('users').upsert(
  { id: target.id, email: target.email, role },
  { onConflict: 'id' },
);
if (dbErr) {
  console.error('⚠  app_metadata mis à jour mais public.users a échoué :', dbErr.message);
}

console.log('✓ Rôle mis à jour');
console.log(`  email : ${target.email}`);
console.log(`  ancien rôle : ${prevRole}  →  nouveau rôle : ${role}`);
console.log(`  id    : ${target.id}`);
if (MFA_ROLES.includes(role)) {
  console.log(
    '⚠  Ce rôle EXIGE le 2FA : à sa prochaine connexion, il devra scanner un QR code (app d’authentification).',
  );
}
