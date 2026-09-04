import { describe, expect, test } from 'vitest';
import { formatPhoneForDisplay, normalizePhone } from '@/lib/domain/phone';

describe('normalizePhone', () => {
  test('normalise un mobile français avec espaces', () => {
    expect(normalizePhone('06 12 34 56 78')).toEqual({ ok: true, e164: '+33612345678' });
  });
  test('accepte points, tirets et parenthèses', () => {
    expect(normalizePhone('06.12.34.56.78')).toEqual({ ok: true, e164: '+33612345678' });
    expect(normalizePhone('(06) 12-34-56-78')).toEqual({ ok: true, e164: '+33612345678' });
  });
  test('accepte +33 et 0033', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toEqual({ ok: true, e164: '+33612345678' });
    expect(normalizePhone('0033612345678')).toEqual({ ok: true, e164: '+33612345678' });
  });
  test('accepte 33 sans indicatif +', () => {
    expect(normalizePhone('33612345678')).toEqual({ ok: true, e164: '+33612345678' });
  });
  test('accepte un numéro international', () => {
    expect(normalizePhone('+41 79 123 45 67')).toEqual({ ok: true, e164: '+41791234567' });
  });
  test('rejette un numéro trop court, trop long ou avec lettres', () => {
    expect(normalizePhone('0612')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizePhone('06123456789012')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizePhone('06 AB 34 56 78')).toEqual({ ok: false, reason: 'invalid' });
  });
  test('rejette un numéro français commençant par 00 national ou répétitif', () => {
    expect(normalizePhone('0012345678')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizePhone('0666666666')).toEqual({ ok: false, reason: 'invalid' });
  });
  test('rejette vide', () => {
    expect(normalizePhone('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('formatPhoneForDisplay', () => {
  test('affiche un numéro français par paires', () => {
    expect(formatPhoneForDisplay('+33612345678')).toBe('06 12 34 56 78');
  });
  test('laisse les autres pays tels quels', () => {
    expect(formatPhoneForDisplay('+41791234567')).toBe('+41791234567');
  });
});
