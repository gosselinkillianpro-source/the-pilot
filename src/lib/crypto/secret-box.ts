import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Chiffrement symétrique des secrets stockés en base (jetons OAuth Calendly).
 *
 * Pourquoi : un jeton Calendly donne accès à l'agenda d'un salarié. Supabase
 * chiffre déjà le disque, mais ça ne protège pas d'une fuite applicative (dump,
 * requête mal scopée, accès console). On chiffre donc au niveau applicatif :
 * même avec la table sous les yeux, un jeton reste inexploitable sans la clé.
 *
 * AES-256-GCM : chiffre ET authentifie (un ciphertext modifié est rejeté au
 * déchiffrement, il ne produit pas silencieusement des octets faux).
 *
 * Format stocké : `v1.<sel>.<iv>.<tag>.<ciphertext>`, chaque partie en base64url.
 * Le préfixe de version permettra une rotation d'algorithme sans casser
 * l'existant.
 *
 * La clé vient de `SECRET_ENCRYPTION_KEY` (32 octets minimum, jamais commitée).
 * Chaque secret a son propre sel : deux jetons identiques donnent deux
 * ciphertexts différents.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // 96 bits, recommandé pour GCM
const MIN_PASSPHRASE_LENGTH = 32;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function passphrase(): string {
  const key = process.env.SECRET_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY manquante : impossible de chiffrer/déchiffrer un secret. ' +
        'Génère-la avec `openssl rand -base64 48`.',
    );
  }
  if (key.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `SECRET_ENCRYPTION_KEY trop courte (${key.length} caractères, minimum ${MIN_PASSPHRASE_LENGTH}).`,
    );
  }
  return key;
}

/** Dérive la clé AES à partir de la passphrase et du sel du message. */
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(passphrase(), salt, KEY_LENGTH);
}

/** Chiffre une valeur. Renvoie une chaîne opaque, stockable telle quelle. */
export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64url(salt), b64url(iv), b64url(tag), b64url(ciphertext)].join('.');
}

/**
 * Déchiffre une valeur produite par `encryptSecret`.
 * Lève si le format est invalide, la version inconnue, ou si le contenu a été
 * altéré (échec d'authentification GCM).
 */
export function decryptSecret(stored: string): string {
  const [version, saltB64, ivB64, tagB64, dataB64] = stored.split('.');
  if (!version || !saltB64 || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Secret chiffré illisible : format inattendu.');
  }
  if (version !== VERSION) {
    throw new Error(`Secret chiffré illisible : version « ${version} » non gérée.`);
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(Buffer.from(saltB64, 'base64url')),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Vrai si la clé de chiffrement est configurée (pour afficher un état honnête). */
export function isEncryptionConfigured(): boolean {
  const key = process.env.SECRET_ENCRYPTION_KEY;
  return Boolean(key && key.length >= MIN_PASSPHRASE_LENGTH);
}
