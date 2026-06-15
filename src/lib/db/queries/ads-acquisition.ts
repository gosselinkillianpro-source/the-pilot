import 'server-only';
import { sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/ads/period';
import { db } from '@/lib/db';

/**
 * Comptages SAH RÉELS attribués à la pub via le code bonus saisi à l'inscription.
 *
 * Attribution manuelle SAH (codes communiqués dans les pubs) :
 *   - code SEVEN-BREACH(*)  → Meta Ads
 *   - code BREACH-VIP / *VIP* → Google Ads
 * Les codes partenaires/CGP (Seven-club-deal-*, SEVEN-CD-*) ne sont PAS des ads.
 *
 * « complet » = profil renseigné ET KYC validé (registration_complete && onboarding_complete).
 * inscrits/complets : par date de création (sah_created_at).
 * investisseurs/collecte : souscriptions signées (signed_at) par ces inscrits.
 *
 * Lecture seule. Agrégats uniquement. Aucune donnée personnelle exposée.
 */

/** Motifs SQL code bonus → plateforme. Si tu ajoutes des codes pub, étends ici + classifyCode(). */
export const AD_CODE_PATTERNS = {
  Meta: "bonus_code ilike 'SEVEN-BREACH%'", // SEVEN-BREACH, SEVEN-BREACH10
  Google: "bonus_code ilike '%VIP%'", // BREACH-VIP
} as const;

/** Libellé lisible du code représentatif, pour l'affichage. */
export const AD_CODE_LABELS = { Meta: 'SEVEN-BREACH', Google: 'BREACH-VIP' } as const;

export type AdPlatform = 'Meta' | 'Google';
export type CodeSource = AdPlatform | 'Partenaire';

/** Classe un code bonus par source. DOIT rester cohérent avec AD_CODE_PATTERNS. */
export function classifyCode(code: string): CodeSource {
  const c = code.toUpperCase();
  if (c.startsWith('SEVEN-BREACH')) return 'Meta';
  if (c.includes('VIP')) return 'Google';
  return 'Partenaire';
}

export type AcquisitionCounts = {
  inscrits: number; // comptes créés dans la fenêtre, avec le code de la plateforme
  complets: number; // dont profil + KYC OK aujourd'hui
  investisseurs: number; // ont signé une souscription dans la fenêtre
  collecte: number; // € signés dans la fenêtre (non annulés)
};

export type AttributedCounts = Record<AdPlatform, AcquisitionCounts>;

type Row = Record<string, string | number | null>;
const n = (v: string | number | null | undefined) => Number(v) || 0;

/** Fenêtre [since 00:00 ; until+1j 00:00[ — `until` inclusif (jour entier). */
function windowFilter(col: string, range: DateRange) {
  return sql`${sql.raw(col)} >= ${range.since}::date and ${sql.raw(col)} < (${range.until}::date + interval '1 day')`;
}

export async function getAttributedCounts(range: DateRange): Promise<AttributedCounts> {
  const metaInv = sql.raw(AD_CODE_PATTERNS.Meta);
  const googleInv = sql.raw(AD_CODE_PATTERNS.Google);
  const metaSub = sql.raw(AD_CODE_PATTERNS.Meta.replace('bonus_code', 'i.bonus_code'));
  const googleSub = sql.raw(AD_CODE_PATTERNS.Google.replace('bonus_code', 'i.bonus_code'));
  const complete = sql`registration_complete and onboarding_complete`;
  const created = windowFilter('sah_created_at', range);
  const signed = windowFilter('s.signed_at', range);

  const [invR, subR] = await Promise.all([
    db.execute(sql`
      select
        count(*) filter (where ${metaInv} and ${created})::int as meta_inscrits,
        count(*) filter (where ${metaInv} and ${created} and ${complete})::int as meta_complets,
        count(*) filter (where ${googleInv} and ${created})::int as google_inscrits,
        count(*) filter (where ${googleInv} and ${created} and ${complete})::int as google_complets
      from investors
      where deleted_at is null and sah_created_at is not null
    `),
    db.execute(sql`
      select
        count(distinct s.investor_id) filter (where ${metaSub} and ${signed})::int as meta_investisseurs,
        coalesce(sum(s.amount) filter (where ${metaSub} and ${signed}), 0) as meta_collecte,
        count(distinct s.investor_id) filter (where ${googleSub} and ${signed})::int as google_investisseurs,
        coalesce(sum(s.amount) filter (where ${googleSub} and ${signed}), 0) as google_collecte
      from subscriptions s
      join investors i on i.id = s.investor_id
      where s.status <> 'cancelled' and s.signed_at is not null and i.deleted_at is null
    `),
  ]);

  const inv = (invR as unknown as Row[])[0] ?? {};
  const sub = (subR as unknown as Row[])[0] ?? {};

  return {
    Meta: {
      inscrits: n(inv.meta_inscrits),
      complets: n(inv.meta_complets),
      investisseurs: n(sub.meta_investisseurs),
      collecte: n(sub.meta_collecte),
    },
    Google: {
      inscrits: n(inv.google_inscrits),
      complets: n(inv.google_complets),
      investisseurs: n(sub.google_investisseurs),
      collecte: n(sub.google_collecte),
    },
  };
}

export type CodeRow = {
  code: string;
  source: CodeSource;
  inscrits: number;
  complets: number;
  investisseurs: number;
  collecte: number;
};

/**
 * Suivi par CODE BONUS sur la période : funnel inscrits → complets → investisseurs → collecte.
 * Trié par collecte puis inscrits, limité aux `limit` premiers codes actifs sur la fenêtre.
 * Indépendant de la dépense pub : marche avec les vraies données SAH dès maintenant.
 */
export async function getCodeTracking(range: DateRange, limit = 12): Promise<CodeRow[]> {
  const created = windowFilter('sah_created_at', range);
  const signed = windowFilter('s.signed_at', range);

  const [invR, subR] = await Promise.all([
    db.execute(sql`
      select trim(bonus_code) as code,
        count(*)::int as inscrits,
        count(*) filter (where registration_complete and onboarding_complete)::int as complets
      from investors
      where deleted_at is null and sah_created_at is not null
        and bonus_code is not null and trim(bonus_code) <> '' and ${created}
      group by trim(bonus_code)
    `),
    db.execute(sql`
      select trim(i.bonus_code) as code,
        count(distinct s.investor_id)::int as investisseurs,
        coalesce(sum(s.amount), 0) as collecte
      from subscriptions s
      join investors i on i.id = s.investor_id
      where s.status <> 'cancelled' and s.signed_at is not null
        and i.deleted_at is null and i.bonus_code is not null and trim(i.bonus_code) <> ''
        and ${signed}
      group by trim(i.bonus_code)
    `),
  ]);

  const map = new Map<string, CodeRow>();
  const ensure = (code: string): CodeRow => {
    let r = map.get(code);
    if (!r) {
      r = {
        code,
        source: classifyCode(code),
        inscrits: 0,
        complets: 0,
        investisseurs: 0,
        collecte: 0,
      };
      map.set(code, r);
    }
    return r;
  };
  for (const r of invR as unknown as Row[]) {
    const row = ensure(String(r.code));
    row.inscrits = n(r.inscrits);
    row.complets = n(r.complets);
  }
  for (const r of subR as unknown as Row[]) {
    const row = ensure(String(r.code));
    row.investisseurs = n(r.investisseurs);
    row.collecte = n(r.collecte);
  }

  return [...map.values()]
    .sort((a, b) => b.collecte - a.collecte || b.inscrits - a.inscrits)
    .slice(0, limit);
}
