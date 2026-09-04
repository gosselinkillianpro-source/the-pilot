import { describe, expect, test } from 'vitest';
import { capiHashEmail, capiHashPhone, sha256Hex } from '@/lib/crypto/hash';

describe('hachage Meta CAPI', () => {
  test('email : minuscules, sans espaces, SHA-256 hex', () => {
    expect(capiHashEmail('  Marc@Example.com ')).toBe(sha256Hex('marc@example.com'));
    expect(capiHashEmail('marc@example.com')).toHaveLength(64);
  });
  test('téléphone : chiffres seuls, indicatif compris', () => {
    expect(capiHashPhone('+33 6 12 34 56 78')).toBe(sha256Hex('33612345678'));
  });
});
