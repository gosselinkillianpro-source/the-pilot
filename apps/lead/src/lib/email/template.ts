/**
 * Gabarit d'email transactionnel, sobre, sans dépendance. Aucune mention de
 * produit ni de partenaire : conformité apporteur d'affaires.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmail(input: {
  brand: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footer?: string;
}): string {
  const cta = input.cta
    ? `<p style="margin:28px 0 0"><a href="${esc(input.cta.url)}" style="display:inline-block;background:#F26A21;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:15px">${esc(input.cta.label)}</a></p>`
    : '';
  const footer =
    input.footer ??
    'Cet email est envoyé dans le cadre de votre demande de mise en relation. Il ne constitue pas un conseil.';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F6F6F7;font-family:Manrope,Segoe UI,Helvetica,Arial,sans-serif;color:#111114">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F6F7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;border:1px solid #E9E9EC">
<tr><td style="padding:28px 32px 8px;font-weight:700;font-size:14px;letter-spacing:.04em;color:#F26A21;text-transform:uppercase">${esc(input.brand)}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:22px;font-weight:700;line-height:1.3">${esc(input.title)}</td></tr>
<tr><td style="padding:16px 32px 32px;font-size:15px;line-height:1.6;color:#2B2B33">${input.bodyHtml}${cta}</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #E9E9EC;font-size:12px;line-height:1.5;color:#8A8A94">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
