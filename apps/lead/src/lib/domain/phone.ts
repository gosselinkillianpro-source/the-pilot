/**
 * Normalisation des numéros en E.164.
 *
 * Le téléphone est LA donnée qui permet le rappel : un numéro non normalisable
 * est rejeté à l'entrée (422), jamais stocké « tel quel ». Français par défaut
 * (« 06 12 34 56 78 » → « +33612345678 »), international accepté avec `+` ou
 * `00`. Pas de dépendance : les cas réels du formulaire tiennent en 40 lignes.
 */

export type PhoneNormalization =
  | { ok: true; e164: string }
  | { ok: false; reason: 'empty' | 'invalid' };

const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

function isRepeatedDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function normalizePhone(raw: string | null | undefined): PhoneNormalization {
  if (!raw) return { ok: false, reason: 'empty' };
  let s = raw.replace(/[\s.\-() ]/g, '');
  if (s === '') return { ok: false, reason: 'empty' };

  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (!/^\d+$/.test(digits)) return { ok: false, reason: 'invalid' };
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
      return { ok: false, reason: 'invalid' };
    }
    if (digits.startsWith('33')) {
      // France : +33 puis 9 chiffres dont le premier entre 1 et 9.
      const national = digits.slice(2);
      if (!/^[1-9]\d{8}$/.test(national)) return { ok: false, reason: 'invalid' };
    } else if (digits.startsWith('1')) {
      // Amérique du Nord : +1 puis exactement 10 chiffres.
      if (digits.length !== 11) return { ok: false, reason: 'invalid' };
    }
    if (isRepeatedDigit(digits)) return { ok: false, reason: 'invalid' };
    return { ok: true, e164: `+${digits}` };
  }

  if (!/^\d+$/.test(s)) return { ok: false, reason: 'invalid' };

  // Format national français : 0X XX XX XX XX.
  if (/^0[1-9]\d{8}$/.test(s)) {
    if (isRepeatedDigit(s.slice(1))) return { ok: false, reason: 'invalid' };
    return { ok: true, e164: `+33${s.slice(1)}` };
  }
  // « 33612345678 » sans le + (copié d'un carnet d'adresses).
  if (/^33[1-9]\d{8}$/.test(s)) {
    return { ok: true, e164: `+${s}` };
  }
  return { ok: false, reason: 'invalid' };
}

/** « +33612345678 » → « 06 12 34 56 78 » pour l'affichage ; autres pays tels quels. */
export function formatPhoneForDisplay(e164: string): string {
  if (e164.startsWith('+33') && e164.length === 12) {
    const national = `0${e164.slice(3)}`;
    return national.replace(/(\d{2})(?=\d)/g, '$1 ');
  }
  return e164;
}
