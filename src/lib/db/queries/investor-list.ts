import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isBreachCode } from './call-queue';

/**
 * Requête UNIQUE derrière la liste d'investisseurs.
 *
 * Elle remplace trois requêtes qui interrogeaient la même table avec des WHERE
 * différents (listInvestors, getCloserPortfolio, getReinvestCandidates). Chaque
 * ancienne page devient une VUE : un jeu de filtres, pas une page de plus.
 *
 * ⚠️ Ne remplace PAS `getCallQueue`. La file d'appels n'est pas un filtre :
 * c'est un moteur de priorisation (scoring, buckets, verrous de claim) dont le
 * tri dépend de `scoreInvestor()`, non exprimable en SQL. La fusionner ici
 * réordonnerait silencieusement la file de travail des closers.
 *
 * Échéance de remboursement : `expected_completion_at + 1 an` (décision Killian,
 * cf. reinvest.ts) — plus fiable que la `repayment_date` SAH.
 */

const REPAYMENT_LAG = "interval '1 year'";
const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export type InvestorSort = 'recent' | 'invested' | 'repayment' | 'name' | 'last_call';

export type InvestorListFilters = {
  /** Recherche plein texte sur nom + e-mail. */
  search?: string;
  /** UUID d'un closer, ou 'none' pour les investisseurs sans closer attitré. */
  closerId?: string;
  /** Étape dérivée des drapeaux SAH (jamais de `pipeline_stage` saisi à la main). */
  stage?: 'registered' | 'profile_complete' | 'onboarded';
  /** A investi (au moins une souscription non annulée) ou non. */
  invested?: 'yes' | 'no';
  source?: 'breach' | 'other';
  /** Ne garde que ceux dont le capital revient dans N jours (implique « a investi »). */
  repaymentWithinDays?: number;
  /** Capital minimum investi, en euros. */
  minInvested?: number;
  /** Inscrit sur SAH il y a N jours ou moins. */
  signedUpWithinDays?: number;
  sort?: InvestorSort;
  limit?: number;
  offset?: number;
};

export type InvestorListRow = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  isBreach: boolean;
  totalInvested: number;
  walletBalanceCents: number | null;
  sahCreatedAt: Date | null;
  assignedCloserId: string | null;
  assignedCloserName: string | null;
  /** Échéance estimée la plus proche (clôture collecte + 1 an), si à venir. */
  nextRepayment: Date | null;
  daysUntilRepayment: number | null;
  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  nextActionAt: Date | null;
  nextActionType: string | null;
};

type RawRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  registration_complete: boolean;
  onboarding_complete: boolean;
  bonus_code: string | null;
  breach_level: number | null;
  wallet_balance_cents: string | number | null;
  sah_created_at: string | null;
  assigned_closer_id: string | null;
  assigned_closer_name: string | null;
  total_invested: string | number;
  next_repayment: string | null;
  last_call_at: string | null;
  last_call_outcome: string | null;
  next_action_at: string | null;
  next_action_type: string | null;
};

/** Clauses WHERE appliquées avant agrégation (donc sur `investors` seul). */
function buildWhere(f: InvestorListFilters) {
  const parts = [sql`i.deleted_at is null`];

  if (f.search?.trim()) {
    const like = `%${f.search.trim()}%`;
    parts.push(sql`(i.full_name ilike ${like} or i.email ilike ${like})`);
  }

  if (f.closerId === 'none') {
    parts.push(sql`i.assigned_closer_id is null`);
  } else if (f.closerId) {
    parts.push(sql`i.assigned_closer_id = ${f.closerId}::uuid`);
  }

  if (f.stage === 'onboarded') {
    parts.push(sql`i.onboarding_complete`);
  } else if (f.stage === 'profile_complete') {
    parts.push(sql`i.registration_complete and not i.onboarding_complete`);
  } else if (f.stage === 'registered') {
    parts.push(sql`not i.registration_complete`);
  }

  if (f.source === 'breach') {
    parts.push(sql`(i.breach_level is not null or i.bonus_code ilike '%breach%')`);
  } else if (f.source === 'other') {
    parts.push(
      sql`i.breach_level is null and (i.bonus_code is null or i.bonus_code not ilike '%breach%')`,
    );
  }

  if (f.signedUpWithinDays != null) {
    parts.push(
      sql`i.sah_created_at >= now() - make_interval(days => ${Math.max(0, Math.floor(f.signedUpWithinDays))})`,
    );
  }

  return sql.join(parts, sql` and `);
}

/**
 * Clauses HAVING : elles portent sur les agrégats, donc après GROUP BY.
 * `invested` et `minInvested` s'y trouvent parce qu'ils dépendent de la somme
 * des souscriptions non annulées, pas d'une colonne de `investors`.
 */
function buildHaving(f: InvestorListFilters) {
  const total = sql`coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0)`;
  const parts = [];

  if (f.invested === 'yes') parts.push(sql`${total} > 0`);
  else if (f.invested === 'no') parts.push(sql`${total} = 0`);

  if (f.minInvested != null) parts.push(sql`${total} >= ${f.minInvested}`);

  if (f.repaymentWithinDays != null) {
    const days = Math.max(0, Math.floor(f.repaymentWithinDays));
    parts.push(sql`
      min(case
        when s.status <> 'cancelled'
          and p.expected_completion_at is not null
          and p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)} > now()
        then p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)}
      end) <= now() + make_interval(days => ${days})
    `);
  }

  if (parts.length === 0) return sql``;
  return sql` having ${sql.join(parts, sql` and `)}`;
}

function buildOrderBy(sort: InvestorSort | undefined) {
  switch (sort) {
    case 'invested':
      return sql`total_invested desc nulls last, i.sah_created_at desc`;
    case 'repayment':
      return sql`next_repayment asc nulls last, total_invested desc`;
    case 'name':
      return sql`i.full_name asc nulls last`;
    case 'last_call':
      return sql`last_call_at desc nulls last`;
    default:
      return sql`i.onboarding_complete desc, i.sah_created_at desc nulls last`;
  }
}

export async function listInvestorsFiltered(
  f: InvestorListFilters = {},
): Promise<{ rows: InvestorListRow[]; total: number }> {
  const where = buildWhere(f);
  const having = buildHaving(f);
  const limit = Math.min(MAX_LIMIT, Math.max(1, f.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, f.offset ?? 0);

  const result = await db.execute(sql`
    select
      i.id::text as id,
      i.full_name,
      i.email,
      i.phone,
      i.address_city as city,
      i.registration_complete,
      i.onboarding_complete,
      i.bonus_code,
      i.breach_level,
      i.wallet_balance_cents,
      i.sah_created_at,
      i.assigned_closer_id::text as assigned_closer_id,
      au.full_name as assigned_closer_name,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      min(case
        when s.status <> 'cancelled'
          and p.expected_completion_at is not null
          and p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)} > now()
        then p.expected_completion_at + ${sql.raw(REPAYMENT_LAG)}
      end) as next_repayment,
      lc.created_at as last_call_at,
      lc.outcome as last_call_outcome,
      na.due_at as next_action_at,
      na.type as next_action_type
    from investors i
    left join users au on au.id = i.assigned_closer_id
    left join subscriptions s on s.investor_id = i.id
    left join projects p on p.id = s.project_id
    left join lateral (
      select created_at, outcome from interactions ix
      where ix.investor_id = i.id and ix.type in ('call_outbound', 'call_inbound')
      order by created_at desc limit 1
    ) lc on true
    left join lateral (
      select due_at, type from closer_tasks ct
      where ct.investor_id = i.id and ct.status = 'pending'
      order by due_at asc limit 1
    ) na on true
    where ${where}
    group by i.id, au.full_name, lc.created_at, lc.outcome, na.due_at, na.type
    ${having}
    order by ${buildOrderBy(f.sort)}
    limit ${limit} offset ${offset}
  `);

  // Le total doit subir les MÊMES filtres, HAVING compris : on compte les
  // groupes survivants, pas les lignes d'investisseurs.
  const countResult = await db.execute(sql`
    select count(*)::int as n from (
      select i.id
      from investors i
      left join subscriptions s on s.investor_id = i.id
      left join projects p on p.id = s.project_id
      where ${where}
      group by i.id
      ${having}
    ) t
  `);

  const raw = result as unknown as RawRow[];
  const now = Date.now();

  const rows: InvestorListRow[] = raw.map((r) => {
    const repayment = r.next_repayment ? new Date(r.next_repayment) : null;
    return {
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      registrationComplete: Boolean(r.registration_complete),
      onboardingComplete: Boolean(r.onboarding_complete),
      isBreach: r.breach_level != null || isBreachCode(r.bonus_code),
      totalInvested: Number(r.total_invested) || 0,
      walletBalanceCents: r.wallet_balance_cents != null ? Number(r.wallet_balance_cents) : null,
      sahCreatedAt: r.sah_created_at ? new Date(r.sah_created_at) : null,
      assignedCloserId: r.assigned_closer_id,
      assignedCloserName: r.assigned_closer_name,
      nextRepayment: repayment,
      daysUntilRepayment: repayment ? Math.ceil((repayment.getTime() - now) / DAY_MS) : null,
      lastCallAt: r.last_call_at ? new Date(r.last_call_at) : null,
      lastCallOutcome: r.last_call_outcome,
      nextActionAt: r.next_action_at ? new Date(r.next_action_at) : null,
      nextActionType: r.next_action_type,
    };
  });

  const total = Number((countResult as unknown as { n: number }[])[0]?.n) || 0;
  return { rows, total };
}
