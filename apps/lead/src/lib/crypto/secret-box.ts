import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { requireEnv } from '@/lib/env';

/**
 * Chiffrement symétrique des secrets stockés en base (jetons OAuth Calendly
 * des acheteurs). AES-256-GCM : chiffre et authentifie. Format stocké :
 * `v1.<sel>.<iv>.<tag>.<ciphertext>` en base64url. Clé : SECRET_ENCRYPTION_KEY.
 */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const MIN_PASSPHRASE_LENGTH = 32;

function passphrase(): string {
  const key = requireEnv('SECRET_ENCRYPTION_KEY');
  if (key.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY trop courte (32 caractères minimum). `openssl rand -base64 48`',
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(passphrase(), salt, KEY_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, salt, iv, tag, enc]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptSecret(stored: string): string {
  const [version, saltB, ivB, tagB, encB] = stored.split('.');
  if (version !== VERSION || !saltB || !ivB || !tagB || !encB) {
    throw new Error('Secret chiffré illisible (format inattendu).');
  }
  const salt = Buffer.from(saltB, 'base64url');
  const key = scryptSync(passphrase(), salt, KEY_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
