/**
 * Crée un compte utilisateur THE PILOT (app interne, pas d'inscription publique).
 *
 * Usage :
 *   node --env-file=.env.local scripts/create-user.mjs <email> <mot_de_passe> [role] [sah_user_id]
 *
 * role : admin | closer | closer_junior | executive | admin_affiliate  (défaut : admin)
 *
 * sah_user_id : OBLIGATOIRE si role = admin_affiliate. C'est le sah_id de la personne
 * SAH (ex. 1100 pour Killian) dont ce compte verra le sous-réseau, et RIEN d'autre.
 *
 * Le rôle est écrit dans app_metadata.role → lu par le JWT (RLS + permissions code).
 * L'email est marqué confirmé (pas d'email de validation à cliquer).
 */
import { createClient } from '@supabase/supabase-js';

const VALID_ROLES = ['admin', 'closer', 'closer_junior', 'executive', 'admin_affiliate'];
const MFA_ROLES = ['admin', 'closer', 'closer_junior', 'admin_affiliate'];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('ERREUR : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.');
  console.error(
    'Lance avec : node --env-file=.env.local scripts/create-user.mjs <email> <mdp> [role]',
  );
  process.exit(1);
}

const [, , email, password, roleArg = 'admin', sahUserId] = process.argv;

if (!email || !password) {
  console.error(
    'Usage : node --env-file=.env.local scripts/create-user.mjs <email> <mot_de_passe> [role] [sah_user_id]',
  );
  process.exit(1);
}
if (!VALID_ROLES.includes(roleArg)) {
  console.error(`Rôle invalide : "${roleArg}". Valeurs possibles : ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('Mot de passe trop court (8 caractères minimum).');
  process.exit(1);
}
if (roleArg === 'admin_affiliate' && !sahUserId) {
  console.error(
    'Rôle admin_affiliate : sah_user_id obligatoire (le sah_id de la personne SAH dont ce compte voit le réseau).',
  );
  console.error(
    'Ex : node --env-file=.env.local scripts/create-user.mjs affilie@x.fr MotDePasse admin_affiliate 1100',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: roleArg },
});

if (error) {
  console.error('ÉCHEC :', error.message);
  process.exit(1);
}

// Ligne applicative dans public.users (cible des clés étrangères : closer assigné,
// auteur d'appel, etc.). L'id DOIT correspondre à l'uid Auth.
const fullName =
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || email;
const userRow = { id: data.user.id, email, full_name: fullName, role: roleArg };
if (roleArg === 'admin_affiliate') userRow.sah_user_id = sahUserId;
const { error: dbError } = await admin.from('users').upsert(userRow, { onConflict: 'id' });
if (dbError) {
  console.error('⚠  Compte Auth créé mais insertion public.users échouée :', dbError.message);
  console.error('   (l’app la recréera au 1er usage via ensureUserRecord.)');
}

console.log('✓ Compte créé');
console.log(`  email : ${data.user.email}`);
console.log(`  rôle  : ${roleArg}`);
if (roleArg === 'admin_affiliate') console.log(`  réseau (sah_user_id) : ${sahUserId}`);
console.log(`  id    : ${data.user.id}`);
console.log('');
console.log(
  MFA_ROLES.includes(roleArg)
    ? '⚠  Ce rôle exige le 2FA : à la 1ère connexion, tu devras scanner un QR code (Google Authenticator).'
    : 'ℹ  Connexion directe (le 2FA est optionnel pour ce rôle).',
);
