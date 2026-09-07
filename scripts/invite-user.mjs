/**
 * Invite une personne sur THE PILOT depuis la ligne de commande — outil de
 * SECOURS. La voie normale est la page Équipe (bouton « Inviter ») : même
 * table, même e-mail, même lien. Ce script sert quand personne n'est connecté
 * en admin (mise en place initiale, dépannage).
 *
 * Usage :
 *   node --env-file=.env.local scripts/invite-user.mjs <email> "<Prénom Nom>" <role> [sah_user_id] [--no-email]
 *
 * role : closer | closer_junior | executive | admin
 * sah_user_id : n° SAH de la personne (CGP) — ses inscrits lui seront attribués à l'acceptation.
 * --no-email : crée l'invitation et affiche le lien, sans envoyer d'e-mail.
 *
 * L'e-mail part via Brevo avec les mêmes garde-fous que l'app (EMAIL_TEST_MODE →
 * adresse de test). Le lien est affiché une seule fois : la base n'en garde que
 * l'empreinte SHA-256.
 */
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const VALID_ROLES = ['closer', 'closer_junior', 'executive', 'admin'];
const TTL_DAYS = 7;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const noEmail = process.argv.includes('--no-email');
const [email, fullName, role, sahUserId] = args;

if (!email || !fullName || !role || !VALID_ROLES.includes(role)) {
  console.error(
    'Usage : node --env-file=.env.local scripts/invite-user.mjs <email> "<Prénom Nom>" <role> [sah_user_id] [--no-email]',
  );
  console.error(`role : ${VALID_ROLES.join(' | ')}`);
  process.exit(1);
}
if (sahUserId && !/^\d{1,10}$/.test(sahUserId)) {
  console.error('sah_user_id doit être un nombre (ex. 1315).');
  process.exit(1);
}
const dbUrl = process.env.DATABASE_URL;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
if (!dbUrl || !appUrl) {
  console.error('DATABASE_URL et NEXT_PUBLIC_APP_URL sont requis (.env.local).');
  process.exit(1);
}

const sql = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 20 });
try {
  const lower = email.trim().toLowerCase();
  const existing = await sql`select id from users where lower(email) = ${lower} limit 1`;
  if (existing.length > 0) {
    console.error(`Un compte existe déjà pour ${lower}. Rien fait.`);
    process.exit(1);
  }
  const open = await sql`
    select id from user_invitations
    where lower(email) = ${lower} and accepted_at is null and revoked_at is null and expires_at > now()
    limit 1`;
  if (open.length > 0) {
    console.error(`Une invitation est déjà en cours pour ${lower}. Renvoie-la depuis /equipe.`);
    process.exit(1);
  }

  // Invité par le premier admin trouvé (traçabilité) — l'admin Killian en pratique.
  const admin =
    await sql`select id, full_name, email from users where role = 'admin' and active order by created_at asc limit 1`;
  const inviter = admin[0] ?? null;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);
  const inserted = await sql`
    insert into user_invitations (email, full_name, role, sah_user_id, token_hash, invited_by, expires_at)
    values (${lower}, ${fullName}, ${role}, ${sahUserId ?? null}, ${tokenHash}, ${inviter?.id ?? null}, ${expiresAt})
    returning id`;
  const id = inserted[0].id;
  const url = `${appUrl}/invitation/${token}`;

  console.log('✓ Invitation créée');
  console.log(`  id     : ${id}`);
  console.log(`  email  : ${lower}`);
  console.log(`  rôle   : ${role}${sahUserId ? `  ·  compte SAH ${sahUserId}` : ''}`);
  console.log(`  expire : ${expiresAt.toISOString()}`);
  console.log(`  lien   : ${url}`);

  if (noEmail) {
    console.log('ℹ  --no-email : aucun e-mail envoyé, transmets le lien toi-même.');
  } else {
    const key = process.env.BREVO_API_KEY;
    const testMode = process.env.EMAIL_TEST_MODE !== 'false';
    const testAddress = process.env.EMAIL_TEST_ADDRESS ?? '';
    const senderAddress = process.env.EMAIL_SENDER_ADDRESS ?? 'newsletter@sevenathome.com';
    if (!key) {
      console.error('⚠  BREVO_API_KEY absente : e-mail non envoyé. Transmets le lien toi-même.');
    } else if (testMode && !testAddress) {
      console.error('⚠  EMAIL_TEST_MODE actif sans EMAIL_TEST_ADDRESS : e-mail non envoyé.');
    } else {
      const to = testMode ? testAddress : lower;
      const prenom = fullName.trim().split(/\s+/)[0];
      const roleLabel =
        {
          admin: 'administrateur',
          closer: 'closer',
          closer_junior: 'closer junior',
          executive: 'direction (lecture)',
        }[role] ?? role;
      const until = expiresAt.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Paris',
      });
      const esc = (s) =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      const inviterName = inviter?.full_name?.trim() || 'Killian';
      const lines = [
        `Bonjour ${prenom},`,
        `${inviterName} t’ouvre un accès à THE PILOT, l’outil interne de Seven At Home, en tant que ${roleLabel}.`,
        `Ton identifiant sera ton adresse ${lower}. Clique sur le bouton pour choisir ton mot de passe : le compte est créé à ce moment-là, puis tu actives la double authentification (application type Google Authenticator) — elle est obligatoire pour ton rôle.`,
        `Le lien est personnel et valable jusqu’au ${until}.`,
      ];
      const sans = "-apple-system,'Segoe UI',Arial,Helvetica,sans-serif";
      const html = `<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#F8F6F2;font-family:${sans}">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E8E4DC;border-radius:12px;padding:36px 40px">
<div style="font-size:20px;font-weight:700;color:#0D0D0B">THE PILOT <span style="font-size:13px;font-weight:400;color:#5A5754">· Seven At Home</span></div>
<div style="height:1px;background:#E8E4DC;margin:12px 0 24px"></div>
${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#0D0D0B">${esc(l)}</p>`).join('')}
<p style="margin:20px 0 8px"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background:#A0783B;color:#fff;font-weight:600;text-decoration:none;border-radius:8px">Choisir mon mot de passe</a></p>
<p style="font-size:12px;color:#5A5754;line-height:1.6">Si le bouton ne fonctionne pas, copie ce lien : <a href="${esc(url)}" style="color:#A0783B;word-break:break-all">${esc(url)}</a></p>
<p style="font-size:11px;color:#5A5754;border-top:1px solid #E8E4DC;padding-top:14px;margin-top:20px">Outil interne Seven At Home · accès restreint. Si tu n’attendais pas cet e-mail, ignore-le : sans ton action, aucun compte n’est créé.</p>
</div></body></html>`;
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'THE PILOT · Seven At Home', email: senderAddress },
          to: [{ email: to, name: fullName }],
          subject: `${testMode ? '[TEST] ' : ''}Ton accès à THE PILOT (Seven At Home)`,
          htmlContent: html,
        }),
      });
      if (!res.ok) {
        console.error(
          `⚠  Brevo ${res.status} : ${(await res.text()).slice(0, 300)} — transmets le lien toi-même.`,
        );
      } else {
        await sql`update user_invitations set last_sent_at = now(), send_count = send_count + 1 where id = ${id}`;
        console.log(
          testMode
            ? `✓ E-mail envoyé à l'adresse de TEST ${to} (EMAIL_TEST_MODE actif)`
            : `✓ E-mail envoyé à ${to}`,
        );
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
