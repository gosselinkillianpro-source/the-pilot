import 'server-only';
import { sql } from 'drizzle-orm';
import type { DateRange } from '@/lib/ads/period';
import { db } from '@/lib/db';

/**
 * Comptages SAH RÉELS attribués à la pub via le code bonus saisi à l'inscription.
 *
 * ⚠️ Google Ads est EN PAUSE (décision Killian 02/09/2026) : tous les codes pub
 * — SEVEN-BREACH(*) comme BREACH-VIP/*VIP* — sont attribués à Meta. Le jour où
 * Google revient, re-séparer les motifs ici + classifyCode() + overview.ts.
 * Les codes partenaires/CGP (Seven-club-deal-*, SEVEN-CD-*) ne sont PAS des ads.
 *
 * « complet » = profil renseigné ET KYC validé (registration_complete && onboarding_complete).
 * inscrits/complets : par date de création (sah_created_at).
 * investisseurs/collecte : souscriptions signées (signed_at) par ces inscrits.
 *
 * Lecture seule. Agrégats uniquement. Aucune donnée personnelle exposée.
 */

/**
 * Motifs SQL code bonus → plateforme. Tout va à Meta tant que Google est en
 * pause ; `Google: 'false'` garde la forme (aucune ligne ne matche jamais).
 */
export const AD_CODE_PATTERNS = {
  Meta: "(bonus_code ilike 'SEVEN-BREACH%' or bonus_code ilike '%VIP%')",
  Google: 'false',
} as const;

/** Libellé lisible des codes, pour l'affichage. */
export const AD_CODE_LABELS = { Meta: 'SEVEN-BREACH + VIP', Google: '—' } as const;

export type AdPlatform = 'Meta' | 'Google';
export type CodeSource = AdPlatform | 'Partenaire';

/** Classe un code bonus par source. DOIT rester cohérent avec AD_CODE_PATTERNS. */
export function classifyCode(code: string): CodeSource {
  const c = code.toUpperCase();
  if (c.startsWith('SEVEN-BREACH')) return 'Meta';
  if (c.includes('VIP')) return 'Meta'; // ex-Google, rattaché à Meta (pause Google)
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
  const metaSub = sql.raw(AD_CODE_PATTERNS.Meta.replaceAll('bonus_code', 'i.bonus_code'));
  const googleSub = sql.raw(AD_CODE_PATTERNS.Google.replaceAll('bonus_code', 'i.bonus_code'));
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

/**
 * Un lead vu en RDV Calendly compte comme ads si AUCUN autre canal ne le
 * revendique. Attention aux fausses évidences : le funnel pub écrit LUI-MÊME
 * parrain « SEVEN BREACH » (niveau 0) et CGP « BREACH », et SAH marque souvent
 * Guillaume (le closer vers qui les pubs envoient) comme apporteur — ces
 * marqueurs-là SONT le canal ads, on ne les exclut pas (décision Killian
 * 02/09/2026). On exclut : code partenaire saisi, parrainage par un autre
 * investisseur (niveau ≥ 1), vrai CGP tiers. Conditions sur l'alias `i`
 * (investors) — partagées avec countRdvAutoTracked.
 */
export const RDV_ADS_ELIGIBLE_SQL = `
  (i.bonus_code is null or trim(i.bonus_code) = '')
  and coalesce(i.breach_level, 0) < 1
  and (
    i.cgp_name is null or trim(i.cgp_name) = ''
    or i.cgp_name ilike '%breach%'
    or i.cgp_name ilike '%gosselin%'
  )
`;

/**
 * Bucket « RDV Calendly + manuels » : personnes attribuées aux ads SANS code bonus pub.
 *
 * Les pubs BREACH n'orientent que vers la prise de RDV Calendly : quelqu'un qui
 * prend RDV puis investit sans jamais saisir de code vient bien de la pub. Règle :
 *   - RDV Calendly (rdv_contacts.source = 'calendly' relié à une fiche) → attribué,
 *     SAUF si un autre canal le revendique (voir RDV_ADS_ELIGIBLE_SQL) ;
 *   - attribution MANUELLE (table ad_attributions) → décision humaine explicite,
 *     elle prime sur ces exclusions.
 * Dans les deux cas, les porteurs d'un code PUB sont exclus : ils sont déjà
 * comptés dans les lignes Meta/Google (jamais de double compte).
 *
 * Mêmes fenêtres que l'attribution par code : inscrits/complets par date de
 * création SAH, investisseurs/collecte par date de signature.
 */
/** Condition « ne porte pas un code pub » (alias `i`) — sinon déjà compté par code. */
const NOT_AD_CODE_SQL = `(i.bonus_code is null or not ${AD_CODE_PATTERNS.Meta.replaceAll('bonus_code', 'i.bonus_code')})`;

/** Condition « a une attribution manuelle » (alias `i`). */
const HAS_MANUAL_SQL = '(exists (select 1 from ad_attributions a where a.investor_id = i.id))';

/** Condition « attribué via RDV Calendly » (alias `i`) : fiche RDV + aucun autre canal. */
const RDV_BUCKET_SQL = `(
  exists (select 1 from rdv_contacts rc where rc.investor_id = i.id and rc.source = 'calendly')
  and ${RDV_ADS_ELIGIBLE_SQL}
)`;

/** Funnel inscrits→complets→investisseurs→collecte pour un sous-ensemble d'investisseurs. */
async function countsForEligible(
  eligibleWhere: string,
  range: DateRange,
): Promise<AcquisitionCounts> {
  const created = windowFilter('e.sah_created_at', range);
  const signed = windowFilter('s.signed_at', range);

  const res = await db.execute(sql`
    with eligible as (
      select i.id, i.sah_created_at, i.registration_complete, i.onboarding_complete
      from investors i
      where i.deleted_at is null and ${sql.raw(eligibleWhere)}
    )
    select
      (select count(*) from eligible e where e.sah_created_at is not null and ${created})::int as inscrits,
      (select count(*) from eligible e
        where e.sah_created_at is not null and ${created}
          and e.registration_complete and e.onboarding_complete)::int as complets,
      (select count(distinct s.investor_id) from subscriptions s
        join eligible e on e.id = s.investor_id
        where s.status <> 'cancelled' and s.signed_at is not null and ${signed})::int as investisseurs,
      (select coalesce(sum(s.amount), 0) from subscriptions s
        join eligible e on e.id = s.investor_id
        where s.status <> 'cancelled' and s.signed_at is not null and ${signed}) as collecte
  `);

  const row = (res as unknown as Row[])[0] ?? {};
  return {
    inscrits: n(row.inscrits),
    complets: n(row.complets),
    investisseurs: n(row.investisseurs),
    collecte: n(row.collecte),
  };
}

export async function getRdvManualCounts(range: DateRange): Promise<AcquisitionCounts> {
  return countsForEligible(
    `${NOT_AD_CODE_SQL} and (${HAS_MANUAL_SQL} or ${RDV_BUCKET_SQL})`,
    range,
  );
}

/**
 * Ventilation du bucket hors-codes pour l'affichage « attribution honnête » :
 *   - manual  = attribué CERTAIN (décision humaine explicite, table ad_attributions) ;
 *   - rdv     = attribué PROBABLE (déduit du RDV Calendly, sans autre canal).
 * Disjoints entre eux et disjoints des codes : manual + rdv = getRdvManualCounts.
 */
export type ExtraSplit = { manual: AcquisitionCounts; rdv: AcquisitionCounts };

export async function getManualVsRdvSplit(range: DateRange): Promise<ExtraSplit> {
  const [manual, rdv] = await Promise.all([
    countsForEligible(`${NOT_AD_CODE_SQL} and ${HAS_MANUAL_SQL}`, range),
    countsForEligible(`${NOT_AD_CODE_SQL} and not ${HAS_MANUAL_SQL} and ${RDV_BUCKET_SQL}`, range),
  ]);
  return { manual, rdv };
}

/**
 * Totaux SAH toutes origines sur la fenêtre — le dénominateur de l'attribution
 * honnête : NON attribué = total − attribué, jamais masqué ni réparti.
 */
export type SahTotals = { inscrits: number; investisseurs: number; collecte: number };

export async function getSahTotals(range: DateRange): Promise<SahTotals> {
  const created = windowFilter('i.sah_created_at', range);
  const signed = windowFilter('s.signed_at', range);
  const res = await db.execute(sql`
    select
      (select count(*) from investors i
        where i.deleted_at is null and i.sah_created_at is not null and ${created})::int as inscrits,
      (select count(distinct s.investor_id) from subscriptions s
        join investors i on i.id = s.investor_id
        where s.status <> 'cancelled' and s.signed_at is not null
          and i.deleted_at is null and ${signed})::int as investisseurs,
      (select coalesce(sum(s.amount), 0) from subscriptions s
        join investors i on i.id = s.investor_id
        where s.status <> 'cancelled' and s.signed_at is not null
          and i.deleted_at is null and ${signed}) as collecte
  `);
  const row = (res as unknown as Row[])[0] ?? {};
  return {
    inscrits: n(row.inscrits),
    investisseurs: n(row.investisseurs),
    collecte: n(row.collecte),
  };
}

/**
 * RDV Calendly de la fenêtre, pour le funnel.
 *
 * ⚠️ Limites de tracking assumées (affichées sur la page) :
 *   - « pris » = fiches rdv_contacts créées dans la fenêtre (une fiche naît à la
 *     première ouverture de /rdv qui voit le RDV, pas à la prise du RDV) ;
 *   - « honorés » = fiches de la fenêtre dont l'étape À DATE a dépassé
 *     « pris en charge » (un RDV honoré fait passer la fiche à « appelé »).
 *     Il n'existe pas de date d'honoré persistée.
 */
export type RdvFunnelCounts = {
  pris: number;
  honores: number;
  /** false = aucun contact Calendly en base, TOUTES périodes : « non tracké », pas zéro. */
  tracked: boolean;
};

export async function getRdvFunnelCounts(range: DateRange): Promise<RdvFunnelCounts> {
  const created = windowFilter('rc.created_at', range);
  const res = await db.execute(sql`
    select
      count(*) filter (where ${created})::int as pris,
      count(*) filter (
        where ${created}
          and rc.pipeline_stage in ('called', 'interested', 'account_ready', 'invested')
      )::int as honores,
      (count(*) > 0) as tracked
    from rdv_contacts rc
    where rc.source = 'calendly'
  `);
  const row = (res as unknown as Row[])[0] ?? {};
  return { pris: n(row.pris), honores: n(row.honores), tracked: Boolean(row.tracked) };
}

/**
 * Cohortes par MOIS DE CRÉATION du lead (sah_created_at), pas par mois
 * d'encaissement — la vue de vérité pour un cycle de vente long : « les leads
 * d'avril ont coûté X (dépense pub d'avril), rapporté Y À DATE ».
 * Périmètre : tous les leads attribués ads (codes ∪ manuel ∪ RDV Calendly).
 */
export type CohortRow = {
  month: string; // 'YYYY-MM'
  leads: number; // inscrits attribués créés ce mois
  complets: number; // dont profil + KYC ok à date
  investisseurs: number; // ont signé au moins une souscription, à date
  collecte: number; // € signés à date (toutes dates de signature)
};

export async function getAdsCohortRows(monthsBack = 6): Promise<CohortRow[]> {
  const adsCode = sql.raw(AD_CODE_PATTERNS.Meta.replaceAll('bonus_code', 'i.bonus_code'));
  const res = await db.execute(sql`
    with attributed as (
      select i.id, to_char(date_trunc('month', i.sah_created_at), 'YYYY-MM') as month,
             i.registration_complete, i.onboarding_complete
      from investors i
      where i.deleted_at is null and i.sah_created_at is not null
        and i.sah_created_at >= date_trunc('month', now()) - make_interval(months => ${monthsBack - 1})
        and (
          ${adsCode}
          or ${sql.raw(HAS_MANUAL_SQL)}
          or ${sql.raw(RDV_BUCKET_SQL)}
        )
    )
    select a.month,
      count(distinct a.id)::int as leads,
      count(distinct a.id) filter (where a.registration_complete and a.onboarding_complete)::int as complets,
      count(distinct s.investor_id)::int as investisseurs,
      coalesce(sum(s.amount), 0) as collecte
    from attributed a
    left join subscriptions s
      on s.investor_id = a.id and s.status <> 'cancelled' and s.signed_at is not null
    group by a.month
    order by a.month desc
  `);
  return (res as unknown as Row[]).map((r) => ({
    month: String(r.month),
    leads: n(r.leads),
    complets: n(r.complets),
    investisseurs: n(r.investisseurs),
    collecte: n(r.collecte),
  }));
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
 * Suivi par CODE BONUS PUB sur la période : funnel inscrits → complets → investisseurs → collecte.
 * Restreint aux codes pub (SEVEN-BREACH*, *VIP*) — les codes partenaires/CGP sont EXCLUS.
 * Trié par collecte puis inscrits. Indépendant de la dépense pub : marche dès maintenant.
 */
export async function getCodeTracking(range: DateRange, limit = 12): Promise<CodeRow[]> {
  const created = windowFilter('sah_created_at', range);
  const signed = windowFilter('s.signed_at', range);
  // Filtre « code pub » = un de nos codes ads, dans les deux contextes de colonne.
  const adInv = sql.raw(`(${AD_CODE_PATTERNS.Meta} or ${AD_CODE_PATTERNS.Google})`);
  const adSub = sql.raw(
    `(${AD_CODE_PATTERNS.Meta.replaceAll('bonus_code', 'i.bonus_code')} or ${AD_CODE_PATTERNS.Google.replaceAll('bonus_code', 'i.bonus_code')})`,
  );

  const [invR, subR] = await Promise.all([
    db.execute(sql`
      select trim(bonus_code) as code,
        count(*)::int as inscrits,
        count(*) filter (where registration_complete and onboarding_complete)::int as complets
      from investors
      where deleted_at is null and sah_created_at is not null
        and bonus_code is not null and trim(bonus_code) <> '' and ${adInv} and ${created}
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
        and ${adSub} and ${signed}
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
