/**
 * Template d'email Seven At Home — HTML compatible clients mail (tables + styles inline).
 * Tous les emails sortants passent par ici : header marque + contenu + footer légal/AMF.
 * Fonction pure (utilisable côté serveur ET client pour l'aperçu).
 */

export type EmailTemplateInput = {
  title?: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Encart d'information affiché en haut du contenu (ex: bandeau mode test). */
  notice?: string;
};

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
        ? '<div style="height:12px;line-height:12px">&nbsp;</div>'
        : `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#0A0E1A">${escapeHtml(l)}</p>`,
    )
    .join('');

  const titleHtml = input.title?.trim()
    ? `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.25;color:#0A0E1A">${escapeHtml(input.title)}</h1>`
    : '';

  const ctaHtml =
    input.ctaLabel?.trim() && input.ctaUrl?.trim()
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
           <tr><td style="border-radius:8px;background:#2563EB">
             <a href="${escapeHtml(input.ctaUrl)}" target="_blank" rel="noopener"
                style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">
               ${escapeHtml(input.ctaLabel)}
             </a>
           </td></tr>
         </table>`
      : '';

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,20,35,0.06)">

        <!-- Header marque -->
        <tr><td style="background:#2563EB;padding:22px 32px">
          <span style="font-size:18px;font-weight:800;letter-spacing:0.04em;color:#ffffff">SEVEN AT HOME</span>
        </td></tr>

        <!-- Contenu -->
        <tr><td style="padding:32px">
          ${
            input.notice?.trim()
              ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#78350F">${escapeHtml(input.notice)}</div>`
              : ''
          }
          ${titleHtml}
          ${paragraphs}
          ${ctaHtml}
        </td></tr>

        <!-- Footer legal + AMF -->
        <tr><td style="padding:22px 32px;background:#F4F6FA;border-top:1px solid #E5E8EF">
          <p style="margin:0 0 8px;font-size:11px;line-height:1.5;color:#6B7280">
            <strong>Seven At Home</strong> — Seven Capital Invest SA · RCS Romans 943&nbsp;832&nbsp;543<br>
            Club deal immobilier privé.
          </p>
          <p style="margin:0 0 8px;font-size:11px;line-height:1.5;color:#6B7280">
            Investir comporte un risque de perte en capital. <strong>Rendement cible, capital non garanti.</strong>
            Les performances passées ne préjugent pas des performances futures.
          </p>
          <p style="margin:0;font-size:11px;color:#9CA3AF">
            <a href="{{unsubscribe}}" style="color:#9CA3AF">Se désinscrire</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
