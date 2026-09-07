import { createHash, randomBytes } from 'node:crypto';

/**
 * Le jeton d'invitation : ce qui voyage dans le lien, et ce qu'on en garde.
 *
 * Le lien contient le jeton en clair ; la base n'en garde que l'empreinte
 * SHA-256. Quelqu'un qui lit la table ne peut pas fabriquer un lien valide, et
 * l'admin ne peut « copier le lien » qu'au moment où il est généré (création ou
 * renvoi, qui fabrique un nouveau jeton et périme l'ancien).
 *
 * Module pur (hors base) : testé.
 */

/** Une invitation est valable une semaine : au-delà, l'admin la renvoie. */
export const INVITATION_TTL_DAYS = 7;

/** Longueur minimale du mot de passe choisi à l'acceptation. */
export const MIN_PASSWORD_LENGTH = 10;

/** 32 octets aléatoires en base64url : 43 caractères sûrs dans une URL. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Un jeton plausible : base64url, longueur attendue. Refuse le reste sans toucher la base. */
export function looksLikeInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,48}$/.test(token);
}

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
}

export type InvitationStatusInput = {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export function invitationStatus(inv: InvitationStatusInput, now: Date): InvitationStatus {
  if (inv.acceptedAt) return 'accepted';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

/** Phrase montrée à la personne quand le lien ne peut plus servir. */
export const INVITATION_STATUS_MESSAGE: Record<Exclude<InvitationStatus, 'pending'>, string> = {
  accepted: 'Cette invitation a déjà été utilisée : ton compte existe, connecte-toi.',
  revoked: 'Cette invitation a été annulée. Demande un nouveau lien à Killian.',
  expired: 'Cette invitation a expiré (7 jours). Demande un nouveau lien à Killian.',
};

export function invitationUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/invitation/${token}`;
}

/** Libellé humain du rôle, pour l'e-mail et la page d'acceptation. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'administrateur';
    case 'closer':
      return 'closer';
    case 'closer_junior':
      return 'closer junior';
    case 'executive':
      return 'direction (lecture)';
    case 'admin_affiliate':
      return 'admin affilié';
    default:
      return role;
  }
}
