import 'server-only';
import { sql } from 'drizzle-orm';
import { compareForQueue, type ScoredInvestor, scoreInvestor } from '@/lib/closing/scoring';
import { db } from '@/lib/db';
import { MISSED_ATTEMPTS } from '@/lib/db/queries/closing-pipeline';

/**
 * Au-delà de ce délai (minutes), un verrou « Je prends » est considéré expiré.
 * 30 min (décision Killian, 4 sept. 2026) : « Je prends » réserve la personne
 * le temps de l'appeler ; sans résultat enregistré, elle revient au pool.
 */
export const CLAIM_TTL_MIN = 30;

export type QueueFollowUp = {
  /** Appels joints (`reached` / `in_progress`), tout l'historique. */
  reachedCount: number;
  /** Appels sans réponse depuis le dernier contact abouti. */
  missedAttempts: number;
  callCount: number;
  /** Prochaine action en attente (la plus proche). */
  nextTask: { id: string; type: string; dueAt: Date; note: string | null } | null;
};

export type QueueRow = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  /** Date de création du compte côté SAH (= date d'inscription). */
  sahCreatedAt: Date | null;
  registrationComplete: boolean;
  onboardingComplete: boolean;
  assignedCloserId: string | null;
  pipelineStage: string;
  totalInvested: number;
  /** Solde du wallet en cents (argent disponible, non investi). */
  walletBalanceCents: number | null;
  /** Code bonus (apporteur). BREACH = vient des pubs de Killian. */
  bonusCode: string | null;
  isBreach: boolean;
  /** Apporteur (CGP) tel que SAH le renseigne — sert à écarter les clients de partenaires tiers. */
  cgpName: string | null;
  cgpNetwork: string | null;
  /** Note libre du closer (internal_note), tronquée — aperçu directement sur la ligne de file. */
  internalNote: string | null;
  /** Verrou de travail actif (dans le TTL) : qui l'a pris, null si libre. */
  claimedById: string | null;
  claimedAt: Date | null;
  claimerName: string | null;
  /** Closer attitré (propriété collante) : son correspondant permanent. */
  assignedCloserName: string | null;
  /** Dernière interaction (appel/note/email) — aperçu sur la ligne de file. */
  lastActivity: {
    type: string;
    outcome: string | null;
    note: string | null;
    at: Date | null;
  } | null;
  /** Renseigné seulement avec l'option `withFollowUp`. */
  followUp: QueueFollowUp | null;
  scored: ScoredInvestor;
};

type RawRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  address_city: string | null;
  registration_complete: boolean;
  onboarding_complete: boolean;
  assigned_closer_id: string | null;
  pipeline_stage: string;
  sah_created_at: string | Date | null;
  breach_level: number | null;
  total_invested: string | number | null;
  wallet_balance_cents: string | number | null;
  wallet_funded_at: string | Date | null;
  active_subscriptions: string | number | null;
  active_projects: string | number | null;
  nearest_repayment: string | Date | null;
  first_sub_at: string | Date | null;
  bonus_code: string | null;
  cgp_name: string | null;
  cgp_network: string | null;
  claimed_by_id: string | null;
  claimed_at: string | Date | null;
  claimer_name: string | null;
  assigned_closer_name: string | null;
  internal_note: string | null;
  last_type: string | null;
  last_outcome: string | null;
  last_note: string | null;
  last_at: string | Date | null;
  reached_count?: string | number | null;
  missed_attempts?: string | number | null;
  call_count?: string | number | null;
  next_task_id?: string | null;
  next_task_type?: string | null;
  next_task_due_at?: string | Date | null;
  next_task_note?: string | null;
};

/** Un code bonus "BREACH" (SEVEN-BREACH, BREACH-VIP…) = lead venant des pubs de Killian. */
export function isBreachCode(code: string | null): boolean {
  return code != null && /breach/i.test(code);
}

export type QueueSource = 'all' | 'breach' | 'other';

const DAY_MS = 86_400_000;

/**
 * Construit la file d'appels priorisée : un score par investisseur, trié par file
 * (ordre de traitement de la journée) puis par priorité. L'échéance de remboursement
 * est reconstituée ici (date de souscription + durée du projet) — signal clé du scoring.
 */
export async function getCallQueue(opts?: {
  assignedCloserId?: string;
  excludeWon?: boolean;
  investorId?: string;
  source?: QueueSource;
  /**
   * ISOLATION "admin affilié" : ne renvoie QUE les investisseurs du sous-réseau de
   * cette personne SAH (via affiliate_network). Garde-fou : si fourni mais vide,
   * la liste sera vide (on ne montre jamais plus que son réseau).
   */
  ownerSahId?: string;
  /** Garder les personnes appelées dans les 3 derniers jours (carnet du closer). */
  includeRecentlyCalled?: boolean;
  /** Ajouter le suivi par personne (joints, tentatives, prochaine action). */
  withFollowUp?: boolean;
}): Promise<QueueRow[]> {
  const now = new Date();
  const closerFilter = opts?.assignedCloserId
    ? sql`and i.assigned_closer_id = ${opts.assignedCloserId}`
    : sql``;
  // `!= null` (et NON un test de vérité) : un sah_id vide '' ne doit JAMAIS faire sauter
  // le filtre (ce qui renverrait toute la base). Vide → le filtre s'applique quand même
  // (aucun réseau n'a owner '') → liste vide. Sécurité indépendante de l'appelant.
  const ownerSahId = opts?.ownerSahId ?? null;
  const networkFilter =
    ownerSahId != null
      ? sql`and exists (
        select 1 from affiliate_network an
        where an.investor_id = i.id and an.owner_sah_id = ${ownerSahId}
      )`
      : sql``;
  const oneFilter = opts?.investorId ? sql`and i.id = ${opts.investorId}` : sql``;
  // Sort de la file les personnes appelées récemment (≤3 j) → "Appelé" les retire.
  // Non appliqué à la fiche individuelle ni au carnet (on veut toujours son score).
  const recentCallFilter =
    opts?.investorId || opts?.includeRecentlyCalled
      ? sql``
      : sql`and not exists (
        select 1 from interactions ix
        where ix.investor_id = i.id
          and ix.type in ('call_outbound', 'call_inbound')
          and ix.created_at >= now() - interval '3 days'
      )`;
  const sourceFilter =
    opts?.source === 'breach'
      ? sql`and (i.breach_level is not null or i.bonus_code ilike '%breach%')`
      : opts?.source === 'other'
        ? sql`and i.breach_level is null and (i.bonus_code is null or i.bonus_code not ilike '%breach%')`
        : sql``;
  // On exclut les leads déjà clos (gagné/perdu) de la file d'appels.
  const stageFilter = opts?.excludeWon
    ? sql`and i.pipeline_stage not in ('closed_won', 'closed_lost')`
    : sql``;

  // Suivi par personne : optionnel, parce que trois sous-requêtes de plus sur
  // toute la base pèsent — le pool n'en a pas besoin, le carnet oui.
  const withFollowUp = opts?.withFollowUp === true;
  const followUpCols = withFollowUp
    ? sql`,
      (select count(*)::int from interactions ix
        where ix.investor_id = i.id
          and ix.type in ('call_outbound', 'call_inbound')
          and ix.outcome in ('reached', 'in_progress')) as reached_count,
      (select count(*)::int from interactions ix
        where ix.investor_id = i.id
          and ix.type in ('call_outbound', 'call_inbound')) as call_count,
      ${MISSED_ATTEMPTS} as missed_attempts,
      nt.id::text as next_task_id,
      nt.type as next_task_type,
      nt.due_at as next_task_due_at,
      nt.note as next_task_note`
    : sql``;
  const followUpJoin = withFollowUp
    ? sql`left join lateral (
        select ct.id, ct.type, ct.due_at, ct.note
        from closer_tasks ct
        where ct.investor_id = i.id and ct.status = 'pending'
        order by ct.due_at asc
        limit 1
      ) nt on true`
    : sql``;
  const followUpGroup = withFollowUp ? sql`, nt.id, nt.type, nt.due_at, nt.note` : sql``;

  const result = await db.execute(sql`
    select
      i.id::text as id,
      i.full_name,
      i.email,
      i.phone,
      i.address_city,
      i.registration_complete,
      i.onboarding_complete,
      i.assigned_closer_id::text as assigned_closer_id,
      i.pipeline_stage,
      i.sah_created_at,
      i.breach_level,
      i.bonus_code,
      i.cgp_name,
      i.cgp_network,
      i.wallet_balance_cents,
      i.wallet_funded_at,
      left(i.internal_note, 200) as internal_note,
      i.claimed_by_id::text as claimed_by_id,
      i.claimed_at,
      cu.full_name as claimer_name,
      au.full_name as assigned_closer_name,
      coalesce(sum(case when s.status <> 'cancelled' then s.amount else 0 end), 0) as total_invested,
      count(s.id) filter (where s.status <> 'cancelled') as active_subscriptions,
      count(distinct s.project_id) filter (
        where s.status <> 'cancelled'
          and p.status in ('open', 'funding', 'funded', 'in_operation', 'repaying')
      ) as active_projects,
      min(
        case
          when s.status <> 'cancelled'
            and p.repayment_date is not null
            and p.repayment_date > now()
          then p.repayment_date
        end
      ) as nearest_repayment,
      min(s.signed_at) filter (where s.status <> 'cancelled') as first_sub_at,
      li.type as last_type,
      li.outcome as last_outcome,
      left(li.note, 80) as last_note,
      li.created_at as last_at
      ${followUpCols}
    from investors i
    left join subscriptions s on s.investor_id = i.id
    left join projects p on p.id = s.project_id
    left join users cu on cu.id = i.claimed_by_id
    left join users au on au.id = i.assigned_closer_id
    left join lateral (
      select x.type, x.outcome, x.note, x.created_at
      from interactions x
      where x.investor_id = i.id
      order by x.created_at desc
      limit 1
    ) li on true
    ${followUpJoin}
    where i.deleted_at is null
    ${closerFilter}
    ${networkFilter}
    ${oneFilter}
    ${stageFilter}
    ${sourceFilter}
    ${recentCallFilter}
    group by i.id, cu.full_name, au.full_name, li.type, li.outcome, li.note, li.created_at
    ${followUpGroup}
  `);

  const rows = result as unknown as RawRow[];

  const claimCutoff = now.getTime() - CLAIM_TTL_MIN * 60_000;
  const queue: QueueRow[] = rows.map((r) => {
    const totalInvested = Number(r.total_invested) || 0;
    const nearestRepaymentDays = r.nearest_repayment
      ? Math.ceil((new Date(r.nearest_repayment).getTime() - now.getTime()) / DAY_MS)
      : null;
    const firstInvestmentDays = r.first_sub_at
      ? Math.floor((now.getTime() - new Date(r.first_sub_at).getTime()) / DAY_MS)
      : null;
    // Verrou actif uniquement s'il est récent (sinon expiré → lead de nouveau libre).
    const claimActive =
      r.claimed_by_id != null &&
      r.claimed_at != null &&
      new Date(r.claimed_at).getTime() >= claimCutoff;
    const walletBalanceCents =
      r.wallet_balance_cents != null ? Number(r.wallet_balance_cents) : null;
    const walletFundedAt = r.wallet_funded_at ? new Date(r.wallet_funded_at) : null;
    const walletDaysSitting = walletFundedAt
      ? Math.floor((now.getTime() - walletFundedAt.getTime()) / DAY_MS)
      : null;
    const scored = scoreInvestor({
      registrationComplete: r.registration_complete,
      onboardingComplete: r.onboarding_complete,
      sahCreatedAt: r.sah_created_at ? new Date(r.sah_created_at) : null,
      totalInvested,
      activeSubscriptions: Number(r.active_subscriptions) || 0,
      activeProjectsCount: Number(r.active_projects) || 0,
      nearestRepaymentDays,
      firstInvestmentDays,
      walletBalanceCents,
      walletDaysSitting,
      now,
    });
    const followUp: QueueFollowUp | null = withFollowUp
      ? {
          reachedCount: Number(r.reached_count) || 0,
          missedAttempts: Number(r.missed_attempts) || 0,
          callCount: Number(r.call_count) || 0,
          nextTask:
            r.next_task_id && r.next_task_due_at
              ? {
                  id: r.next_task_id,
                  type: r.next_task_type ?? 'callback',
                  dueAt: new Date(r.next_task_due_at),
                  note: r.next_task_note ?? null,
                }
              : null,
        }
      : null;
    return {
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      city: r.address_city,
      sahCreatedAt: r.sah_created_at ? new Date(r.sah_created_at) : null,
      registrationComplete: r.registration_complete,
      onboardingComplete: r.onboarding_complete,
      assignedCloserId: r.assigned_closer_id,
      pipelineStage: r.pipeline_stage,
      totalInvested,
      walletBalanceCents,
      bonusCode: r.bonus_code,
      isBreach: r.breach_level != null || isBreachCode(r.bonus_code),
      cgpName: r.cgp_name,
      cgpNetwork: r.cgp_network,
      internalNote: r.internal_note?.trim() ? r.internal_note.trim() : null,
      claimedById: claimActive ? r.claimed_by_id : null,
      claimedAt: claimActive && r.claimed_at ? new Date(r.claimed_at) : null,
      claimerName: claimActive ? r.claimer_name : null,
      assignedCloserName: r.assigned_closer_name,
      lastActivity: r.last_type
        ? {
            type: r.last_type,
            outcome: r.last_outcome,
            note: r.last_note,
            at: r.last_at ? new Date(r.last_at) : null,
          }
        : null,
      followUp,
      scored,
    };
  });

  queue.sort((a, b) => compareForQueue(a.scored, b.scored));
  return queue;
}

/** Score d'un seul investisseur (pour la fiche). */
export async function getInvestorScored(investorId: string): Promise<QueueRow | null> {
  const rows = await getCallQueue({ investorId });
  return rows[0] ?? null;
}

export type QueueBucketGroup = {
  bucket: number;
  label: string;
  goal: string;
  rows: QueueRow[];
};

/** Regroupe la file par "file d'appel" (bucket), dans l'ordre de traitement. */
export function groupByBucket(queue: QueueRow[]): QueueBucketGroup[] {
  const map = new Map<number, QueueBucketGroup>();
  for (const row of queue) {
    const b = row.scored.queueBucket;
    let g = map.get(b);
    if (!g) {
      g = { bucket: b, label: row.scored.queueLabel, goal: row.scored.callGoal, rows: [] };
      map.set(b, g);
    }
    g.rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.bucket - b.bucket);
}
