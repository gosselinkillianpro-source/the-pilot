/**
 * Crée (ou remet en état) une source de leads avec son secret de webhook.
 * Le secret n'est affiché qu'ICI, une fois : à coller dans la config de
 * /api/lead.php côté site (hors docroot), jamais dans le code du site.
 *
 * Usage : node --env-file=apps/lead/.env.local apps/lead/scripts/seed-source.mjs mep "MonExpertPatrimoine" [--rotate]
 */
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const out = (s) => process.stdout.write(`${s}\n`);

const [, , code, name = code, flag] = process.argv;
const adminDb = process.env.DATABASE_ADMIN_URL;
if (!adminDb || !code) {
  console.error('DATABASE_ADMIN_URL requis. Usage : seed-source.mjs <code> [nom] [--rotate]');
  process.exit(1);
}

const hours = {
  1: { open: '09:00', close: '20:00' },
  2: { open: '09:00', close: '20:00' },
  3: { open: '09:00', close: '20:00' },
  4: { open: '09:00', close: '20:00' },
  5: { open: '09:00', close: '20:00' },
  6: { open: '09:00', close: '20:00' },
};

const script = {
  presentation:
    "Bonjour {prenom}, {setter} de MonExpertPatrimoine. Vous venez de faire votre diagnostic en ligne : je vous appelle pour vérifier deux ou trois points et vous mettre en relation avec l'expert qui correspond à votre profil.",
  capacite:
    'Vous indiquiez un projet de {montant} avec pour objectif {objectif}, {urgence}. Est-ce toujours d’actualité ? Y a-t-il un élément à préciser ?',
  creneau:
    "Je vous propose un rendez-vous téléphonique avec l'expert certifié ORIAS : quel créneau vous arrange cette semaine ?",
  interdits: [
    'Aucun produit, aucune solution nommée.',
    'Aucun partenaire nommé avant le rendez-vous.',
    'Aucune promesse de rendement, aucun « garanti ».',
    'Aucun conseil : on qualifie et on met en relation, c’est tout.',
  ],
};

const offHoursSms =
  'MonExpertPatrimoine : merci {prenom}, votre diagnostic est bien reçu. Un conseiller vous rappelle dès {reprise}. À très vite.';

const secret = randomBytes(24).toString('base64url');
const sql = postgres(adminDb, { prepare: false, connect_timeout: 20 });
try {
  const rotate = flag === '--rotate';
  const rows = await sql`
    insert into lead.sources (code, name, service_hours, webhook_secret, script, off_hours_sms)
    values (${code}, ${name}, ${sql.json(hours)}, ${secret}, ${sql.json(script)}, ${offHoursSms})
    on conflict (code) do update set
      name = excluded.name,
      webhook_secret = case when ${rotate} then excluded.webhook_secret else lead.sources.webhook_secret end,
      script = coalesce(lead.sources.script, excluded.script),
      off_hours_sms = coalesce(lead.sources.off_hours_sms, excluded.off_hours_sms)
    returning id, code, webhook_secret
  `;
  const s = rows[0];
  out(`SOURCE_OK ${s.code} id=${s.id}`);
  out(`X-Source-Key (à coller dans la config du site, hors docroot) : ${s.webhook_secret}`);
} finally {
  await sql.end({ timeout: 5 });
}
