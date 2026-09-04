import 'server-only';
import { sql } from 'drizzle-orm';
import {
  CREDIT_ACTION_TYPES,
  type CreditAction,
  creditActionKind,
  creditEvent,
  creditInvestorSubscriptions,
  RDV_NOTE_KIND,
  type SubCredit,
} from '@/lib/closing/credit';
import { db } from '@/lib/db';

/**
 * Matière du moteur de crédit (`lib/closing/credit.ts`) : pour chaque
 * personne suivie, son propriétaire et les actions que CE propriétaire a eues
 * avec elle. Une action d'un autre closer ne compte pas ; un e-mail marketing
 * non plus. Une seule source pour le classement, Mes résultats, la page
 * Performance et le fil des victoires — sinon les chiffres divergent.
 */

export type OwnerActions = { ownerId: string; actions: CreditAction[] };
export type OwnerActionsMap = Map<string, OwnerActions>;

type Row = {
  investor_id: string;
  owner_id: string;
  type: string;
  outcome: string | null;
  meta_kind: string | null;
  at: string | Date;
};

/**
 * Propriétaire + ses actions, par investisseur. Sans liste d'ids : toute la
 * base (classement, performance) ; avec : seulement ces personnes.
 */
export async function loadOwnerActions(investorIds?: string[]): Promise<OwnerActionsMap> {
  const map: OwnerActionsMap = new Map();
  if (investorIds && investorIds.length === 0) return map;

  const idFilter = investorIds
    ? sql`and i.id in (${sql.join(
        investorIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const typeList = sql.join(
    CREDIT_ACTION_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );

  const rows = (await db.execute(sql`
    select
      i.id::text as investor_id,
      i.assigned_closer_id::text as owner_id,
      ix.type,
      ix.outcome,
      ix.metadata->>'kind' as meta_kind,
      ix.created_at as at
    from investors i
    join interactions ix
      on ix.investor_id = i.id
     and ix.user_id = i.assigned_closer_id
     and (ix.type in (${typeList})
          or (ix.type = 'note_added' and ix.metadata->>'kind' = ${RDV_NOTE_KIND}))
    where i.deleted_at is null
      and i.assigned_closer_id is not null
      ${idFilter}
    order by ix.created_at asc
  `)) as unknown as Row[];

  for (const r of rows) {
    const kind = creditActionKind(r.type, r.meta_kind);
    if (!kind) continue;
    const entry = map.get(r.investor_id) ?? { ownerId: r.owner_id, actions: [] };
    entry.actions.push({
      at: new Date(r.at),
      kind,
      reached: kind === 'call' ? r.outcome === 'reached' : undefined,
    });
    map.set(r.investor_id, entry);
  }
  return map;
}

export type SubForCredit = {
  id: string;
  investorId: string;
  signedAt: Date;
  amountEur: number;
};

export type CreditedSubscription = SubCredit & SubForCredit;

/**
 * Applique la règle à un lot de souscriptions (de plusieurs personnes).
 * Chaque personne est traitée avec TOUTES ses souscriptions du lot : la
 * notion de « première » en dépend — passer un lot partiel fausse le résultat.
 */
export function creditSubscriptionRows(
  subs: SubForCredit[],
  owners: OwnerActionsMap,
): Map<string, CreditedSubscription> {
  const byInvestor = new Map<string, SubForCredit[]>();
  for (const s of subs) {
    const list = byInvestor.get(s.investorId) ?? [];
    list.push(s);
    byInvestor.set(s.investorId, list);
  }
  const out = new Map<string, CreditedSubscription>();
  for (const [investorId, list] of byInvestor) {
    const owner = owners.get(investorId);
    const credits = creditInvestorSubscriptions({
      subs: list.map((s) => ({ id: s.id, signedAt: s.signedAt, amountEur: s.amountEur })),
      ownerId: owner?.ownerId ?? null,
      ownerActions: owner?.actions ?? [],
    });
    const byId = new Map(list.map((s) => [s.id, s]));
    for (const c of credits) {
      const s = byId.get(c.subId);
      if (s) out.set(c.subId, { ...c, ...s });
    }
  }
  return out;
}

/** Closer crédité d'une progression (KYC validé, profil complété), ou null. */
export function creditedCloserForEvent(
  investorId: string,
  at: Date,
  owners: OwnerActionsMap,
): string | null {
  const owner = owners.get(investorId);
  if (!owner) return null;
  return creditEvent(at, owner.actions).credited ? owner.ownerId : null;
}
