import 'server-only';
import { sql } from 'drizzle-orm';
import {
  type ClosingStage,
  isClosingStage,
  MAX_CALL_ATTEMPTS,
  shouldApplyMove,
  stageAfterQualification,
} from '@/lib/closing/pipeline';
import { db } from '@/lib/db';

/**
 * Tableau de suivi des appels : lecture et déplacements.
 *
 * Une carte = un investisseur qu'on a appelé au moins une fois. Elle apparaît
 * dès que son étape quitte « Nouveau », et disparaît de la file d'appels quand
 * elle tombe en « Injoignable / incompatible » (la file exclut déjà
 * `closed_won` et `closed_lost`).
 */

/** Réseau d'acquisition — mêmes onglets que la file d'appels. */
export type NetworkFilter = 'breach' | 'other' | 'all';

export type ClosingCard = {
  investorId: string;
  fullName: string;
  email: string;
  phone: string | null;
  stage: ClosingStage;
  enteredAt: Date | null;
  stageUpdatedAt: Date | null;
  /** File d'appels d'où la personne venait, figée à l'entrée dans le suivi. */
  source: string | null;

  /** Closer attitré (propriété collante posée au premier appel). */
  ownerId: string | null;
  ownerName: string | null;

  /** Appels sans réponse depuis le dernier contact abouti — la règle des 3. */
  missedAttempts: number;
  callCount: number;
  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  lastNote: string | null;
  /** Prochain rappel programmé. */
  nextActionAt: Date | null;

  totalInvested: number;
  walletBalanceCents: number | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  sahCreatedAt: Date | null;
  /** Venu par le code BREACH (parrainage ou pubs) — le périmètre de Killian. */
  isBreach: boolean;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compte les appels sans réponse depuis le dernier contact abouti.
 *
 * `reached` et `in_progress` remettent le compteur à zéro : quelqu'un qu'on a eu
 * au téléphone puis qui ne répond plus repart de la première tentative. Sans ce
 * garde-fou, un client de longue date finirait « injoignable » à cause de trois
 * appels manqués étalés sur un an.
 */
const MISSED_ATTEMPTS = sql`
  (select count(*)::int from interactions ix
    where ix.investor_id = i.id
      and ix.type in ('call_outbound', 'call_inbound')
      and ix.outcome in ('no_answer', 'voicemail')
      and ix.created_at > coalesce((
        select max(ix2.created_at) from interactions ix2
        where ix2.investor_id = i.id
          and ix2.type in ('call_outbound', 'call_inbound')
          and ix2.outcome in ('reached', 'in_progress')
      ), '-infinity'::timestamptz))
`;

/**
 * Même définition de « BREACH » que la file d'appels : niveau de parrainage
 * renseigné, ou code apporteur contenant « breach ». Dupliquer ce prédicat
 * ailleurs ferait diverger les deux écrans dès la première correction.
 */
const BREACH_PREDICATE = sql`(i.breach_level is not null or i.bonus_code ilike '%breach%')`;

export async function listClosingCards(opts?: {
  source?: string;
  network?: NetworkFilter;
}): Promise<ClosingCard[]> {
  const source = opts?.source;
  const networkFilter =
    opts?.network === 'breach'
      ? sql`and ${BREACH_PREDICATE}`
      : opts?.network === 'other'
        ? sql`and not ${BREACH_PREDICATE}`
        : sql``;
  const rows = await db.execute(sql`
    select
      i.id::text as investor_id,
      coalesce(nullif(trim(i.full_name), ''), i.email) as full_name,
      i.email,
      i.phone,
      i.pipeline_stage,
      i.pipeline_entered_at,
      i.pipeline_stage_updated_at,
      i.pipeline_source,
      i.assigned_closer_id::text as owner_id,
      u.full_name as owner_name,
      i.registration_complete,
      i.onboarding_complete,
      i.wallet_balance_cents,
      i.sah_created_at,
      ${BREACH_PREDICATE} as is_breach,
      ${MISSED_ATTEMPTS} as missed_attempts,
      (select count(*)::int from interactions ix
        where ix.investor_id = i.id and ix.type in ('call_outbound', 'call_inbound')) as call_count,
      (select coalesce(sum(s.amount), 0) from subscriptions s
        where s.investor_id = i.id and s.status <> 'cancelled')::float as total_invested,
      lc.created_at as last_call_at,
      lc.outcome as last_call_outcome,
      lc.note as last_note,
      na.due_at as next_action_at
    from investors i
    left join users u on u.id = i.assigned_closer_id
    left join lateral (
      select created_at, outcome, note from interactions ix
      where ix.investor_id = i.id and ix.type in ('call_outbound', 'call_inbound')
      order by created_at desc limit 1
    ) lc on true
    left join lateral (
      select due_at from closer_tasks ct
      where ct.investor_id = i.id and ct.status = 'pending'
      order by due_at asc limit 1
    ) na on true
    where i.deleted_at is null
      and i.pipeline_stage <> 'new'
      ${source ? sql`and i.pipeline_source = ${source}` : sql``}
      ${networkFilter}
    order by i.pipeline_stage_updated_at desc nulls last
  `);

  const cards: ClosingCard[] = [];
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const stage = String(r.pipeline_stage);
    // Une étape inconnue signalerait une migration incomplète : on ne fait pas
    // disparaître la fiche en silence, on l'écarte du tableau.
    if (!isClosingStage(stage)) continue;
    cards.push({
      investorId: String(r.investor_id),
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      stage,
      enteredAt: toDate(r.pipeline_entered_at),
      stageUpdatedAt: toDate(r.pipeline_stage_updated_at),
      source: r.pipeline_source ? String(r.pipeline_source) : null,
      ownerId: r.owner_id ? String(r.owner_id) : null,
      ownerName: r.owner_name ? String(r.owner_name) : null,
      missedAttempts: Number(r.missed_attempts) || 0,
      callCount: Number(r.call_count) || 0,
      lastCallAt: toDate(r.last_call_at),
      lastCallOutcome: r.last_call_outcome ? String(r.last_call_outcome) : null,
      lastNote: r.last_note ? String(r.last_note) : null,
      nextActionAt: toDate(r.next_action_at),
      totalInvested: Number(r.total_invested) || 0,
      walletBalanceCents: r.wallet_balance_cents != null ? Number(r.wallet_balance_cents) : null,
      registrationComplete: r.registration_complete === true,
      onboardingComplete: r.onboarding_complete === true,
      sahCreatedAt: toDate(r.sah_created_at),
      isBreach: r.is_breach === true,
    });
  }
  return cards;
}

/** Files d'origine présentes dans le tableau, avec leur nombre de cartes. */
export async function countBySource(
  network?: NetworkFilter,
): Promise<{ source: string | null; cards: number }[]> {
  const networkFilter =
    network === 'breach'
      ? sql`and ${BREACH_PREDICATE}`
      : network === 'other'
        ? sql`and not ${BREACH_PREDICATE}`
        : sql``;
  const rows = await db.execute(sql`
    select i.pipeline_source, count(*)::int as cards
    from investors i
    where i.deleted_at is null and i.pipeline_stage <> 'new'
    ${networkFilter}
    group by i.pipeline_source
    order by cards desc
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    source: r.pipeline_source ? String(r.pipeline_source) : null,
    cards: Number(r.cards) || 0,
  }));
}

/* ============================================================
   ÉCRITURES
   ============================================================ */

/** Étape actuelle d'un investisseur (`new` par défaut). */
async function currentStage(investorId: string): Promise<ClosingStage | null> {
  const rows = await db.execute(sql`
    select pipeline_stage from investors where id = ${investorId} limit 1
  `);
  const row = (rows as unknown as { pipeline_stage: string }[])[0];
  if (!row) return null;
  return isClosingStage(row.pipeline_stage) ? row.pipeline_stage : null;
}

/** Nombre d'appels sans réponse depuis le dernier contact abouti. */
export async function missedAttemptsFor(investorId: string): Promise<number> {
  const rows = await db.execute(sql`
    select ${MISSED_ATTEMPTS} as n from investors i where i.id = ${investorId} limit 1
  `);
  const row = (rows as unknown as { n: number }[])[0];
  return Number(row?.n) || 0;
}

export type AppliedMove = { stage: ClosingStage; reason: string } | null;

/**
 * Range la personne après la qualification d'un appel.
 *
 * C'est le cœur du correctif : jusqu'ici, qualifier un appel « pas de réponse »
 * ne changeait rien — la personne n'existait nulle part entre deux appels.
 *
 * @param explicitStage étape choisie à la main par le closer ; elle prime
 *                      toujours sur la règle automatique.
 */
export async function applyQualification(
  investorId: string,
  outcome: string,
  explicitStage?: string,
): Promise<AppliedMove> {
  const current = (await currentStage(investorId)) ?? 'new';

  if (explicitStage && isClosingStage(explicitStage)) {
    if (explicitStage === current) return null;
    await writeStage(investorId, explicitStage);
    return { stage: explicitStage, reason: 'Étape choisie manuellement.' };
  }

  // +1 : l'appel qu'on vient de qualifier compte dans les tentatives. Il est
  // déjà enregistré en base, donc déjà compté — sauf s'il n'a pas encore de
  // résultat, cas du bouton « Appelé » qualifié plus tard. On relit donc.
  const attempts = await missedAttemptsFor(investorId);
  const move = stageAfterQualification(outcome, Math.max(attempts, 1));
  if (!shouldApplyMove(current, move.stage)) return null;

  await writeStage(investorId, move.stage);
  return move;
}

/** Entrée dans le tableau au moment du premier appel (bouton « Appelé »). */
export async function enterPipeline(
  investorId: string,
  source: string | null,
): Promise<ClosingStage | null> {
  const current = (await currentStage(investorId)) ?? 'new';
  if (!shouldApplyMove(current, 'contacted')) {
    // Déjà suivi : on ne réécrit pas sa file d'origine ni son étape.
    return null;
  }
  await writeStage(investorId, 'contacted', source);
  return 'contacted';
}

/** Déplacement à la main depuis le tableau : il fait autorité, y compris en arrière. */
export async function setClosingStage(investorId: string, stage: ClosingStage): Promise<void> {
  await writeStage(investorId, stage);
}

async function writeStage(
  investorId: string,
  stage: ClosingStage,
  source?: string | null,
): Promise<void> {
  await db.execute(sql`
    update investors
    set pipeline_stage = ${stage}::pipeline_stage,
        pipeline_stage_updated_at = now(),
        pipeline_entered_at = coalesce(pipeline_entered_at, now()),
        pipeline_source = coalesce(pipeline_source, ${source ?? null}),
        updated_at = now()
    where id = ${investorId}
  `);
}

/** Nombre d'appels restants avant sortie automatique de la file. */
export function attemptsLeft(missed: number): number {
  return Math.max(0, MAX_CALL_ATTEMPTS - missed);
}
