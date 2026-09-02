import 'server-only';
import { sql } from 'drizzle-orm';
import { ATTRIBUTION_WINDOW_DAYS } from '@/lib/closing/attribution';
import { isClosingStage } from '@/lib/closing/pipeline';
import type { PortfolioLead, PortfolioSub } from '@/lib/closing/portfolio';
import { db } from '@/lib/db';

/**
 * Requête du portefeuille closer : ses leads attitrés, avec le détail de
 * leurs souscriptions POST-ENTRÉE (les seules qui lui sont attribuables —
 * même règle que le rangement automatique de pipeline-auto.ts).
 *
 * Le détail (montant + date par souscription) part au TypeScript plutôt que
 * d'être agrégé ici : le filtre de période se fait en logique pure testée,
 * et un portefeuille de closer reste petit (quelques dizaines de fiches).
 */

/** Même référence de date que partout ailleurs (pipeline-auto, classement). */
const SIGNED_REF = sql`coalesce(s.signed_at, s.paid_at, s.created_at)`;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `json_agg` renvoie l'époque en secondes : pas d'ambiguïté de fuseau. */
function parseSubs(raw: unknown, ownerId: string): PortfolioSub[] {
  const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(items)) return [];
  const subs: PortfolioSub[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const { amount, signed_epoch, attributed_user_id } = item as {
      amount?: unknown;
      signed_epoch?: unknown;
      attributed_user_id?: unknown;
    };
    const signedAt = typeof signed_epoch === 'number' ? new Date(signed_epoch * 1000) : null;
    if (!signedAt) continue;
    subs.push({
      amountEur: Number(amount) || 0,
      signedAt,
      attributedToOwner: attributed_user_id === ownerId,
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
      (select coalesce(json_agg(json_build_object(
            'amount', s.amount::float,
            'signed_epoch', extract(epoch from ${SIGNED_REF}),
            -- Qui est crédité de cette souscription : l'auteur du DERNIER appel
            -- dans la fenêtre des 30 jours — même règle d'attribution que le
            -- classement et /performance (attribution.ts, « l'appel prime »).
            'attributed_user_id', (
              select ix.user_id::text from interactions ix
              where ix.investor_id = i.id
                and ix.type in ('call_outbound', 'call_inbound')
                and ix.created_at <= ${SIGNED_REF}
                and ix.created_at >= ${SIGNED_REF} - make_interval(days => ${ATTRIBUTION_WINDOW_DAYS})
              order by ix.created_at desc limit 1
            )
          ) order by ${SIGNED_REF}), '[]'::json)
        from subscriptions s
        where s.investor_id = i.id
          and s.status <> 'cancelled'
          and ${SIGNED_REF} > coalesce(i.pipeline_entered_at, i.pipeline_stage_updated_at)
      ) as subs,
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
      subs: parseSubs(r.subs, ownerId),
    });
  }
  return leads;
}
