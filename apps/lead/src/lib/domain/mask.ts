/** Masquage des destinataires pour la table `notifications` : preuve d'envoi sans données personnelles complètes. */

export function maskPhone(e164: string): string {
  if (e164.length <= 6) return '•'.repeat(e164.length);
  return `${e164.slice(0, 4)}${'•'.repeat(e164.length - 6)}${e164.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  return `${local.charAt(0)}•••@${domain}`;
}
