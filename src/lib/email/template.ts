/**
 * Template d'email Seven At Home.
 * Objectifs : (1) identité de marque SAH (or #A0783B, crème, texte sombre, accent serif),
 * (2) HTML email-safe (tables + styles inline, polices web-safe),
 * (3) maximiser la délivrabilité / éviter l'onglet Promotions :
 *     - mise en page sobre type "lettre", une seule colonne étroite
 *     - majorité de texte, aucune image lourde, pas de gros bandeau coloré
 *     - un seul lien d'action, footer légal complet (société + adresse + désinscription)
 * Fonction pure (utilisable serveur ET client pour l'aperçu).
 */

export type EmailTemplateInput = {
  title?: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Encart d'information en haut (ex: bandeau mode test). */
  notice?: string;
};

// URL publique du logo Seven At Home (à renseigner — voir NEXT_PUBLIC_EMAIL_LOGO_URL).
// Vide => on affiche seulement le texte. Pour les emails, le logo DOIT être une URL hébergée
// (les images en base64 ou jointes sont bloquées par Gmail et nuisent à la délivrabilité).
const LOGO_URL = process.env.NEXT_PUBLIC_EMAIL_LOGO_URL ?? '';

const GOLD = '#A0783B';
const DARK = '#0D0D0B';
const TX2 = '#5A5754';
const TX3 = '#9A9794';
const BG = '#F8F6F2';
const BORDER = '#E8E4DC';
const SANS = "-apple-system,'Segoe UI',Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmailTemplate(input: EmailTemplateInput): string {
  const paragraphs = input.bodyText
    .split('\n')
    .map((l) => l.trim())
    .map((l) =>
      l === ''
        ? '<div style="height:14px;line-height:14px">&nbsp;</div>'
        : `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.7;color:${DARK}">${escapeHtml(l)}</p>`,
    )
    .join('');

  const titleHtml = input.title?.trim()
    ? `<h1 style="margin:0 0 20px;font-family:${SERIF};font-style:italic;font-weight:400;font-size:24px;line-height:1.3;color:${DARK}">${escapeHtml(input.title)}</h1>`
    : '';

  const ctaHtml =
    input.ctaLabel?.trim() && input.ctaUrl?.trim()
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px">
           <tr><td style="border-radius:8px;background:${GOLD}">
             <a href="${escapeHtml(input.ctaUrl)}" target="_blank" rel="noopener"
                style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">
               ${escapeHtml(input.ctaLabel)}
             </a>
           </td></tr>
         </table>`
      : '';

  const noticeHtml = input.notice?.trim()
    ? `<div style="background:#FBF3DF;border:1px solid ${GOLD};border-radius:8px;padding:10px 14px;margin-bottom:22px;font-family:${SANS};font-size:13px;color:#6B5320">${escapeHtml(input.notice)}</div>`
    : '';

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
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
        <tr><td style="padding:40px 44px">

          <!-- Logo -->
          ${
            LOGO_URL
              ? `<div style="margin-bottom:24px">
                   <img src="${LOGO_URL}" alt="Seven At Home" height="64" style="display:block;height:64px;width:auto;border:0;outline:none">
                 </div>`
              : `<div style="margin-bottom:6px">
                   <span style="font-family:${SANS};font-size:22px;font-weight:700;letter-spacing:-0.01em;color:${DARK}">Seven At Home</span>
                 </div>
                 <div style="height:1px;background:${BORDER};margin:0 0 28px"></div>`
          }

          ${noticeHtml}
          ${titleHtml}
          ${paragraphs}
          ${ctaHtml}

          <!-- Signature -->
          <p style="margin:26px 0 0;font-family:${SANS};font-size:15px;line-height:1.7;color:${DARK}">
            L'équipe Seven At Home
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:22px 44px 30px;border-top:1px solid ${BORDER}">
          <p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:${TX2}">
            <strong style="color:${DARK}">Seven Capital Invest SA</strong> · RCS Romans 943&nbsp;832&nbsp;543<br>
            Club deal immobilier privé.
          </p>
          <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:1.6;color:${TX3}">
            Investir comporte un risque de perte en capital. Rendement cible, capital non garanti.
            Les performances passées ne préjugent pas des performances futures.
          </p>
          <p style="margin:0;font-family:${SANS};font-size:11px;color:${TX3}">
            <a href="{{unsubscribe}}" style="color:${TX3};text-decoration:underline">Se désinscrire</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
