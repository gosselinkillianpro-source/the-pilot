import 'server-only';
import { sql } from 'drizzle-orm';
import { isClosingStage } from '@/lib/closing/pipeline';
import type { CreditedSub, PortfolioLead } from '@/lib/closing/portfolio';
import { db } from '@/lib/db';
import { creditSubscriptionRows, loadOwnerActions } from '@/lib/db/queries/credit-data';

/**
 * Requêtes du portefeuille closer.
 *
 * `listOwnerSubscriptions` : TOUTES les souscriptions des personnes dont ce
 * closer est propriétaire, passées au moteur de crédit (`credit.ts`, règle du
 * 4 sept. 2026) — chacune dit si elle lui est créditée et pourquoi. La vue
 * « Mes résultats » montre les deux : un chiffre sans explication ne vaut rien.
 *
 * `listCreditedSubscriptions` : seulement les créditées (le palmarès).
 *
 * `listPortfolioLeads` : ses leads attitrés — la to-do des sections KYC /
 * inscription / en cours.
 */

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type OwnerSubscription = CreditedSub & {
  subId: string;
  credited: boolean;
  projectName: string | null;
};

export async function listOwnerSubscriptions(ownerId: string): Promise<OwnerSubscription[]> {
  // `signed_at` non nul, comme le classement : une souscription jamais signée
  // n'est créditée à personne.
  const rows = await db.execute(sql`
    select
      s.id::text as sub_id,
      s.investor_id::text as investor_id,
      coalesce(nullif(trim(i.full_name), ''), i.email) as full_name,
      i.email,
      i.phone,
      p.name as project_name,
      s.amount::float as amount,
      s.signed_at,
      (select coalesce(sum(s2.amount), 0) from subscriptions s2
        where s2.investor_id = i.id and s2.status <> 'cancelled')::float as total_invested
    from subscriptions s
    join investors i on i.id = s.investor_id
    left join projects p on p.id = s.project_id
    where s.status <> 'cancelled'
      and s.signed_at is not null
      and i.deleted_at is null
      and i.assigned_closer_id = ${ownerId}
    order by s.signed_at desc
  `);

  type Raw = {
    sub_id: string;
    investor_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    project_name: string | null;
    amount: number | string;
    signed_at: string | Date;
    total_invested: number | string;
  };
  const raws = (rows as unknown as Raw[]).flatMap((r) => {
    const signedAt = toDate(r.signed_at);
    return signedAt ? [{ ...r, signedAt }] : [];
  });

  const investorIds = [...new Set(raws.map((r) => r.investor_id))];
  const owners = await loadOwnerActions(investorIds);
  const credits = creditSubscriptionRows(
    raws.map((r) => ({
      id: r.sub_id,
      investorId: r.investor_id,
      signedAt: r.signedAt,
      amountEur: Number(r.amount) || 0,
    })),
    owners,
  );

  return raws.map((r) => {
    const credit = credits.get(r.sub_id);
    return {
      subId: r.sub_id,
      investorId: r.investor_id,
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      projectName: r.project_name,
      amountEur: Number(r.amount) || 0,
      signedAt: r.signedAt,
      isOwned: true,
      totalInvestedEur: Number(r.total_invested) || 0,
      credited: credit?.credited ?? false,
      kind: credit?.kind ?? null,
      explanation: credit?.explanation ?? 'Personne sans closer attitré.',
    };
  });
}

/** Les souscriptions créditées au closer — le chiffre du classement, nominativement. */
export async function listCreditedSubscriptions(ownerId: string): Promise<CreditedSub[]> {
  const all = await listOwnerSubscriptions(ownerId);
  return all.filter((s) => s.credited);
}

export async function listPortfolioLeads(ownerId: string): Promise<PortfolioLead[]> {
  const rows = await db.execute(sql`
    select
      i.id::text as investor_id,
      coalesce(nullif(trim(i.full_name), ''), i.email) as full_name,
      i.email,
      i.phone,
      i.pipeline_stage,
      i.pipeline_entered_at,
      i.registration_complete,
      i.onboarding_complete,
      i.wallet_balance_cents,
      (select coalesce(sum(s.amount), 0) from subscriptions s
        where s.investor_id = i.id and s.status <> 'cancelled')::float as total_invested,
      lc.created_at as last_call_at,
      na.due_at as next_action_at
    from investors i
    left join lateral (
      select created_at from interactions ix
      where ix.investor_id = i.id and ix.type in ('call_outbound', 'call_inbound')
      order by created_at desc limit 1
    ) lc on true
    left join lateral (
      select due_at from closer_tasks ct
      where ct.investor_id = i.id and ct.status = 'pending'
      order by due_at asc limit 1
    ) na on true
    where i.deleted_at is null
      and i.assigned_closer_id = ${ownerId}
      and i.pipeline_stage <> 'new'
    order by i.pipeline_stage_updated_at desc nulls last
  `);

  const leads: PortfolioLead[] = [];
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const stage = String(r.pipeline_stage);
    // Étape inconnue = migration incomplète : on écarte sans faire disparaître
    // la fiche en silence — même garde-fou que le tableau de suivi.
    if (!isClosingStage(stage)) continue;
    leads.push({
      investorId: String(r.investor_id),
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      stage,
      enteredAt: toDate(r.pipeline_entered_at),
      registrationComplete: r.registration_complete === true,
      onboardingComplete: r.onboarding_complete === true,
      walletBalanceCents: r.wallet_balance_cents != null ? Number(r.wallet_balance_cents) : null,
      nextActionAt: toDate(r.next_action_at),
      lastCallAt: toDate(r.last_call_at),
      totalInvestedEur: Number(r.total_invested) || 0,
    });
  }
  return leads;
}
