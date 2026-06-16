import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Files de relance (récupération de CA), en LECTURE SEULE.
 *
 *  - Rebond : investisseurs dont un capital est bientôt remboursé → proposer un
 *    réinvestissement (le levier #1 : re-signer un client déjà convaincu).
 *  - Endormis : onboardés (KYC validé, peuvent investir) qui n'ont JAMAIS souscrit.
 *
 * On exclut ceux déjà relancés par email récemment (anti-spam). Aucune action
 * n'est déclenchée ici : ces listes alimentent la file de validation humaine.
 */

export type RelanceType = 'rebound' | 'dormant';

export type RelanceCandidate = {
  investorId: string;
  email: string;
  firstName: string;
  fullName: string | null;
  totalInvested: number;
  /** Rebond : date de remboursement la plus proche + montant concerné + projet. */
  repaymentDate: string | null;
  reboundAmount: number | null;
  /** Endormis : depuis quand le compte existe. */
  onboardedSince: string | null;
};

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function mapRow(r: Row): RelanceCandidate {
  return {
    investorId: str(r.id),
    email: str(r.email),
    firstName: str(r.first_name) || 'Investisseur',
    fullName: r.full_name ? str(r.full_name) : null,
    totalInvested: num(r.total_invested),
    repaymentDate: isoOrNull(r.repayment_date),
    reboundAmount: r.rebound_amount == null ? null : num(r.rebound_amount),
    onboardedSince: isoOrNull(r.onboarded_since),
  };
}

/** Capital remboursé dans les 45 prochains jours (ou déjà remboursé < 15 j). */
export async function getReboundCandidates(): Promise<RelanceCandidate[]> {
  try {
    const res = await db.execute(sql`
      select i.id, i.email,
             coalesce(nullif(i.first_name, ''), split_part(coalesce(i.full_name, ''), ' ', 1)) as first_name,
             i.full_name, i.total_invested,
             min(coalesce(s.expected_repayment_at, p.repayment_date)) as repayment_date,
             sum(s.amount) as rebound_amount
      from subscriptions s
      join investors i on i.id = s.investor_id
      left join projects p on p.id = s.project_id
      where i.deleted_at is null
        and i.email is not null and i.email <> ''
        and s.status <> 'cancelled'
        and coalesce(s.expected_repayment_at, p.repayment_date) is not null
        and coalesce(s.expected_repayment_at, p.repayment_date)
            between (now() - interval '15 days') and (now() + interval '45 days')
        and not exists (
          select 1 from interactions x
          where x.investor_id = i.id and x.type = 'email_sent'
            and x.created_at > now() - interval '14 days'
        )
      group by i.id
      order by repayment_date asc
      limit 100
    `);
    const rows = (res as unknown as Row[]) ?? [];
    return rows.map(mapRow);
  } catch (e) {
    console.error('getReboundCandidates failed:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** Onboardés (KYC validé) qui n'ont jamais souscrit, non relancés depuis 30 j. */
export async function getDormantCandidates(): Promise<RelanceCandidate[]> {
  try {
    const res = await db.execute(sql`
      select i.id, i.email,
             coalesce(nullif(i.first_name, ''), split_part(coalesce(i.full_name, ''), ' ', 1)) as first_name,
             i.full_name, i.total_invested,
             i.sah_created_at as onboarded_since
      from investors i
      where i.deleted_at is null
        and i.onboarding_complete = true
        and i.email is not null and i.email <> ''
        and not exists (
          select 1 from subscriptions s
          where s.investor_id = i.id and s.status <> 'cancelled'
        )
        and not exists (
          select 1 from interactions x
          where x.investor_id = i.id and x.type = 'email_sent'
            and x.created_at > now() - interval '30 days'
        )
      order by i.sah_created_at desc nulls last
      limit 100
    `);
    const rows = (res as unknown as Row[]) ?? [];
    return rows.map(mapRow);
  } catch (e) {
    console.error('getDormantCandidates failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
