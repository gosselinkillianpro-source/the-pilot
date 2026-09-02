import 'server-only';
import { sql } from 'drizzle-orm';
import { ATTRIBUTION_WINDOW_DAYS } from '@/lib/closing/attribution';
import { isClosingStage } from '@/lib/closing/pipeline';
import type { CreditedSub, PortfolioLead } from '@/lib/closing/portfolio';
import { db } from '@/lib/db';

/**
 * Requêtes du portefeuille closer.
 *
 * `listCreditedSubscriptions` : les souscriptions CRÉDITÉES au closer par la
 * règle d'attribution de l'app — l'auteur du dernier appel dans les 30 jours
 * avant la signature (attribution.ts, « l'appel prime »). Sur TOUTE la base,
 * comme le classement : pas de condition d'attitrage ni d'entrée dans le
 * tableau de suivi, ces mécanismes étant bien plus récents que l'historique
 * de vente.
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

/** L'auteur du dernier appel dans la fenêtre des 30 jours avant la signature. */
const CREDITED_CALLER = sql`(
  select ix.user_id from interactions ix
  where ix.investor_id = s.investor_id
    and ix.type in ('call_outbound', 'call_inbound')
    and ix.created_at <= s.signed_at
    and ix.created_at >= s.signed_at - make_interval(days => ${ATTRIBUTION_WINDOW_DAYS})
  order by ix.created_at desc limit 1
)`;

export async function listCreditedSubscriptions(ownerId: string): Promise<CreditedSub[]> {
  // `signed_at` non nul, comme le classement : une souscription jamais signée
  // n'est créditée à personne.
  const rows = await db.execute(sql`
    select
      s.investor_id::text as investor_id,
      coalesce(nullif(trim(i.full_name), ''), i.email) as full_name,
      i.email,
      i.phone,
      s.amount::float as amount,
      s.signed_at,
      (i.assigned_closer_id = ${ownerId}) as is_owned,
      (select coalesce(sum(s2.amount), 0) from subscriptions s2
        where s2.investor_id = i.id and s2.status <> 'cancelled')::float as total_invested
    from subscriptions s
    join investors i on i.id = s.investor_id
    where s.status <> 'cancelled'
      and s.signed_at is not null
      and i.deleted_at is null
      and ${CREDITED_CALLER} = ${ownerId}
    order by s.signed_at desc
  `);

  const subs: CreditedSub[] = [];
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const signedAt = toDate(r.signed_at);
    if (!signedAt) continue;
    subs.push({
      investorId: String(r.investor_id),
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      amountEur: Number(r.amount) || 0,
      signedAt,
      isOwned: r.is_owned === true,
      totalInvestedEur: Number(r.total_invested) || 0,
    });
  }
  return subs;
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
