import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { optionalEnv } from '@/lib/env';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Hash salé d'une IP : preuve de consentement RGPD sans stocker l'adresse. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = optionalEnv('LEAD_HASH_SALT') ?? 'dev-salt-non-secret';
  return createHmac('sha256', salt).update(ip.trim()).digest('hex');
}

/** Normalisation Meta CAPI : minuscules, sans espaces ; téléphone en chiffres seuls (indicatif inclus). */
export function capiHashEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

export function capiHashPhone(e164: string): string {
  return sha256Hex(e164.replace(/\D/g, ''));
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
