import { roleLabel } from './token';

/**
 * L'e-mail d'invitation — un message interne, court, avec un seul bouton.
 *
 * Volontairement hors du gabarit « lettre investisseur » (`email/template.ts`) :
 * pas de mention AMF ni de lien de désinscription, ce n'est pas une
 * communication à un investisseur mais l'entrée d'un collègue dans l'outil.
 * Fonction pure : le même rendu sert à l'envoi et à l'aperçu.
 */

export type InvitationEmailInput = {
  fullName: string | null;
  email: string;
  role: string;
  inviterName: string;
  url: string;
  expiresAt: Date;
};

const GOLD = '#A0783B';
const DARK = '#0D0D0B';
const TX2 = '#5A5754';
const BG = '#F8F6F2';
const BORDER = '#E8E4DC';
const SANS = "-apple-system,'Segoe UI',Arial,Helvetica,sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(fullName: string | null, email: string): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split('@')[0] ?? '';
  const part =
    local
      .split(/[._-]+/)
      .filter((p) => p.length > 1)
      .pop() ?? local;
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : 'bonjour';
}

export function invitationSubject(): string {
  return 'Ton accès à THE PILOT (Seven At Home)';
}

export function invitationBodyText(input: InvitationEmailInput): string {
  const prenom = firstName(input.fullName, input.email);
  const until = input.expiresAt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  });
  return [
    `Bonjour ${prenom},`,
    '',
    `${input.inviterName} t’ouvre un accès à THE PILOT, l’outil interne de Seven At Home, en tant que ${roleLabel(input.role)}.`,
    '',
    `Ton identifiant sera ton adresse ${input.email}. Clique sur le bouton pour choisir ton mot de passe : le compte est créé à ce moment-là, puis tu actives la double authentification (application type Google Authenticator) — elle est obligatoire pour ton rôle.`,
    '',
    `Le lien est personnel et valable jusqu’au ${until}.`,
  ].join('\n');
}

export function renderInvitationEmail(input: InvitationEmailInput): string {
  const paragraphs = invitationBodyText(input)
    .split('\n')
    .map((l) =>
      l.trim() === ''
        ? '<div style="height:12px;line-height:12px">&nbsp;</div>'
        : `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.7;color:${DARK}">${escapeHtml(l)}</p>`,
    )
    .join('');
  const url = escapeHtml(input.url);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
        <tr><td style="padding:36px 40px">
          <div style="margin-bottom:6px">
            <span style="font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${DARK}">THE PILOT</span>
            <span style="font-family:${SANS};font-size:13px;color:${TX2}"> · Seven At Home</span>
          </div>
          <div style="height:1px;background:${BORDER};margin:0 0 24px"></div>
          ${paragraphs}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px">
            <tr><td style="border-radius:8px;background:${GOLD}">
              <a href="${url}" target="_blank" rel="noopener"
                 style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
                Choisir mon mot de passe
              </a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${TX2}">
            Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
            <a href="${url}" style="color:${GOLD};word-break:break-all">${url}</a>
          </p>
        </td></tr>
        <tr><td style="padding:18px 40px 26px;border-top:1px solid ${BORDER}">
          <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${TX2}">
            Outil interne Seven At Home · accès restreint. Si tu n’attendais pas cet e-mail, ignore-le : sans ton action, aucun compte n’est créé.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
