/**
 * Club deal : fonctions pures (lecture du corps, validation, CSV, CORS).
 * Portage TypeScript du module de référence club-deal.js, comportement identique.
 */
import { randomInt } from 'node:crypto';
import { DISPOS, DOSSIERS, isKeyOf, MONTANTS, STATUTS } from './constants';

export const MAX_BODY = 20_000;

export type FormData = Record<string, unknown>;

export type ValidInterest = {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  statut: string;
  montant: string;
  disponibilite: string;
  message: string;
  dossiers: string[];
  consent_interet: boolean;
  consent_rgpd: boolean;
  consent_tel: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  page_url: string;
};

export type FieldErrors = Record<string, string>;

/** Texte nettoyé : balises et caractères de contrôle retirés, tronqué à `max`. */
export function str(v: unknown, max?: number): string {
  const s =
    v == null
      ? ''
      : String(v)
          .replace(/<[^>]*>/g, '')
          // biome-ignore lint/suspicious/noControlCharactersInRegex: on retire justement les caractères de contrôle
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
          .trim();
  return max ? s.slice(0, max) : s;
}

/** Numéro au format E.164 (+33…), ou null s'il n'est pas plausible. */
export function normalizePhone(raw: string): string | null {
  let p = String(raw).replace(/[^0-9+]/g, '');
  if (!p || p === '+') return null;
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (p.startsWith('0') && p.length === 10) p = `+33${p.slice(1)}`;
  if (!p.startsWith('+')) p = `+${p}`;
  return /^\+[0-9]{8,15}$/.test(p) ? p : null;
}

/**
 * Corps JSON (fetch du widget, envoyé en text/plain pour éviter le preflight CORS)
 * ou formulaire classique urlencoded (navigateur sans JavaScript, `dossiers[]` répété).
 */
export function parseBody(raw: string): { data: FormData | null; isForm: boolean } {
  const t = raw.slice(0, MAX_BODY);
  if (/^\s*\{/.test(t)) {
    try {
      const parsed: unknown = JSON.parse(t);
      const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
      return { data: isObject ? (parsed as FormData) : null, isForm: false };
    } catch {
      // JSON illisible : réponse « requête invalide », pas une erreur serveur.
      return { data: null, isForm: false };
    }
  }
  const data: FormData = {};
  const dossiers: string[] = [];
  for (const [k, v] of new URLSearchParams(t)) {
    if (k === 'dossiers[]' || k === 'dossiers') dossiers.push(v);
    else data[k] = v;
  }
  if (dossiers.length) data.dossiers = dossiers;
  return { data, isForm: true };
}

function toList(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function validate(d: FormData): { v: ValidInterest; errors: FieldErrors } {
  const v: ValidInterest = {
    prenom: str(d.prenom, 80),
    nom: str(d.nom, 80),
    email: str(d.email, 120).toLowerCase(),
    telephone: str(d.telephone, 25),
    statut: str(d.statut),
    montant: str(d.montant),
    disponibilite: str(d.disponibilite),
    message: str(d.message, 1500),
    dossiers: [...new Set(toList(d.dossiers).map(String))].filter((c) => isKeyOf(DOSSIERS, c)),
    consent_interet: !!d.consent_interet,
    consent_rgpd: !!d.consent_rgpd,
    consent_tel: !!d.consent_tel,
    utm_source: str(d.utm_source, 120),
    utm_medium: str(d.utm_medium, 120),
    utm_campaign: str(d.utm_campaign, 120),
    page_url: str(d.page_url, 300),
  };
  const errors: FieldErrors = {};
  if (!v.prenom) errors.prenom = 'Indiquez votre prénom.';
  if (!v.nom) errors.nom = 'Indiquez votre nom.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email))
    errors.email = 'Indiquez une adresse e-mail valide.';
  if (v.telephone) {
    const p = normalizePhone(v.telephone);
    if (p) v.telephone = p;
    else errors.telephone = 'Ce numéro ne semble pas valide.';
  }
  if (!isKeyOf(STATUTS, v.statut)) errors.statut = 'Dites-nous où vous en êtes avec Seven At Home.';
  if (!v.dossiers.length) errors.dossiers = 'Sélectionnez au moins un projet.';
  if (!isKeyOf(MONTANTS, v.montant)) errors.montant = 'Indiquez un ordre de grandeur.';
  if (!isKeyOf(DISPOS, v.disponibilite))
    errors.disponibilite = 'Indiquez quand les fonds seraient disponibles.';
  if (!v.consent_interet)
    errors.consent_interet = 'Merci de confirmer que vous avez compris la nature de ce formulaire.';
  if (!v.consent_rgpd)
    errors.consent_rgpd = 'Votre accord est nécessaire pour que nous puissions vous recontacter.';
  return { v, errors };
}

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Référence lisible CD-AAMM-XXXX (sans 0/O/1/I pour éviter les confusions au téléphone). */
export function newRefCandidate(now: Date): string {
  const ym = String(now.getUTCFullYear()).slice(2) + String(now.getUTCMonth() + 1).padStart(2, '0');
  let code = '';
  for (let i = 0; i < 4; i++) code += REF_CHARS[randomInt(REF_CHARS.length)];
  return `CD-${ym}-${code}`;
}

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function csvCell(v: unknown): string {
  const s = Array.isArray(v)
    ? v.join(' ; ')
    : v instanceof Date
      ? v.toISOString()
      : v == null
        ? ''
        : String(v);
  // Neutralise les formules (=, +, -, @) à l'ouverture dans Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function normalizeOrigin(o: string): string {
  return o.replace(/\/$/, '').toLowerCase();
}

/** En-têtes CORS : l'origine n'est renvoyée que si elle est dans la liste blanche. */
export function corsHeaders(
  origin: string | null | undefined,
  allowed: readonly string[],
): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' };
  if (origin && allowed.includes(normalizeOrigin(origin))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

/** Première IP de x-forwarded-for (Render est derrière un proxy). */
export function clientIp(forwardedFor: string | null | undefined): string {
  return (forwardedFor ?? '').split(',')[0]?.trim() ?? '';
}
