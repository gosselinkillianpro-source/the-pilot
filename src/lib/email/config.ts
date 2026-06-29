/**
 * Configuration d'envoi email + garde-fou "mode test".
 * Tant que EMAIL_TEST_MODE = true, tout envoi est redirigé vers EMAIL_TEST_ADDRESS.
 */

export type EmailConfig = {
  testMode: boolean;
  testAddress: string;
  senderName: string;
  senderAddress: string;
};

export function getEmailConfig(): EmailConfig {
  return {
    // Par sécurité : mode test ACTIF par défaut (il faut explicitement EMAIL_TEST_MODE=false pour l'éteindre)
    testMode: process.env.EMAIL_TEST_MODE !== 'false',
    testAddress: process.env.EMAIL_TEST_ADDRESS ?? '',
    senderName: process.env.EMAIL_SENDER_NAME ?? 'SevenAtHome',
    senderAddress: process.env.EMAIL_SENDER_ADDRESS ?? 'newsletter@sevenathome.com',
  };
}

export type EmailSender = { name: string; address: string };

/**
 * Liste BLANCHE des expéditeurs autorisés (env `EMAIL_SENDERS`).
 * Format : « Nom Un <a@sevenathome.com>; Nom Deux <b@sevenathome.com> » (séparés par ; ou retour ligne).
 * Chaque adresse DOIT être un expéditeur validé dans Brevo, sinon l'envoi échoue côté Brevo.
 * Si non configuré → un seul expéditeur (celui de getEmailConfig). Le premier de la liste est le défaut.
 */
export function getAllowedSenders(): EmailSender[] {
  const raw = process.env.EMAIL_SENDERS?.trim();
  const cfg = getEmailConfig();
  const fallback: EmailSender = { name: cfg.senderName, address: cfg.senderAddress };
  if (!raw) return [fallback];

  const out: EmailSender[] = [];
  for (const part of raw.split(/[;\n]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(.*?)<([^>]+)>$/);
    if (m) {
      const address = (m[2] ?? '').trim().toLowerCase();
      if (!address) continue;
      out.push({ name: (m[1] ?? '').trim() || address, address });
    } else if (s.includes('@')) {
      out.push({ name: s.toLowerCase(), address: s.toLowerCase() });
    }
  }
  return out.length > 0 ? out : [fallback];
}

/**
 * Résout l'expéditeur demandé contre la liste blanche (anti-usurpation : on n'envoie
 * JAMAIS depuis une adresse arbitraire). Adresse inconnue/absente → expéditeur par défaut.
 */
export function resolveSender(address?: string | null): EmailSender {
  const allowed = getAllowedSenders();
  if (address) {
    const found = allowed.find((s) => s.address === address.toLowerCase());
    if (found) return found;
  }
  return allowed[0] ?? { name: 'SevenAtHome', address: 'newsletter@sevenathome.com' };
}

/**
 * Calage automatique : trouve l'expéditeur qui correspond à l'utilisateur (closer),
 * par rapprochement nom/email. Ex. compte `yannick@breach.com` → expéditeur
 * « Yannick … <yannick@sevenathome.com> ». Aucun match → premier expéditeur (défaut).
 * `identity` = email (et/ou nom) de l'utilisateur connecté.
 */
export function pickSenderForUser(
  senders: EmailSender[],
  identity: string | null | undefined,
): EmailSender | null {
  if (senders.length === 0) return null;
  const id = (identity ?? '').toLowerCase();
  const local = id.split('@')[0] ?? id;
  // Mots distinctifs de l'utilisateur (prénom/nom), ≥4 lettres pour éviter les faux positifs.
  const tokens = `${local} ${id}`.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  for (const s of senders) {
    const target = `${s.name} ${s.address}`.toLowerCase();
    if (tokens.some((t) => target.includes(t))) return s;
  }
  return senders[0] ?? null;
}
