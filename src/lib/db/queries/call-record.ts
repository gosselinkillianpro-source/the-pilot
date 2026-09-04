import 'server-only';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  type CallOutcome,
  type NextActionKind,
  type NextActionProposal,
  proposeNextAction,
  type ReachedResult,
} from '@/lib/closing/next-action';
import { type ClosingStage, queueSourceKey } from '@/lib/closing/pipeline';
import { db } from '@/lib/db';
import { closerTasks, interactions, investors } from '@/lib/db/schema';
import { CLAIM_TTL_MIN, getInvestorScored } from './call-queue';
import {
  type AppliedMove,
  applyQualification,
  enterPipeline,
  missedAttemptsFor,
} from './closing-pipeline';

/**
 * Enregistrer un appel EN UNE FOIS : le résultat, ce qui s'est dit, et la
 * suite (refonte du 4 sept. 2026). C'est ce seul geste qui alimente la
 * timeline, l'étape, la prochaine action, la propriété et le crédit.
 *
 * Règle « une seule action ouverte par personne » : les actions en attente
 * précédentes sont soldées (l'appel a eu lieu), puis la nouvelle est posée.
 */

export type RecordCallInput = {
  userId: string;
  investorId: string;
  outcome: CallOutcome;
  reachedResult?: ReachedResult | null;
  next: { kind: NextActionKind; dueAt?: Date | null; note?: string | null };
  note?: string | null;
  now?: Date;
};

export type RecordCallResult =
  | {
      ok: true;
      interactionId: string;
      moved: AppliedMove;
      proposal: NextActionProposal;
      nextTaskId: string | null;
    }
  | { ok: false; message: string };

/** Étapes que la suite pose explicitement ; les autres suivent la règle automatique (jamais en arrière). */
const EXPLICIT_STAGES: ReadonlySet<ClosingStage> = new Set<ClosingStage>([
  'interested',
  'closed_lost',
  'dormant',
]);

async function claimConflict(investorId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ claimedById: investors.claimedById, claimedAt: investors.claimedAt })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  const claim = rows[0];
  if (!claim?.claimedById || claim.claimedById === userId) return false;
  const cutoff = Date.now() - CLAIM_TTL_MIN * 60_000;
  return claim.claimedAt != null && new Date(claim.claimedAt).getTime() >= cutoff;
}

export async function recordCall(input: RecordCallInput): Promise<RecordCallResult> {
  const now = input.now ?? new Date();
  const { investorId, userId } = input;

  if (await claimConflict(investorId, userId)) {
    return {
      ok: false,
      message: 'Un autre closer travaille cette fiche en ce moment (« Je prends » actif).',
    };
  }

  const current = await db
    .select({ stage: investors.pipelineStage })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  if (!current[0]) return { ok: false, message: 'Personne introuvable.' };
  const stageAtCall = current[0].stage;

  // 1. L'appel lui-même — timeline, crédit, tentatives.
  const inserted = await db
    .insert(interactions)
    .values({
      investorId,
      type: 'call_outbound',
      outcome: input.outcome,
      note: input.note?.trim() || null,
      userId,
      metadata: {
        stageAtCall,
        reachedResult: input.reachedResult ?? null,
        nextKind: input.next.kind,
      },
    })
    .returning({ id: interactions.id });
  const interactionId = inserted[0]?.id ?? '';

  // 2. La suite proposée par la règle, sur les tentatives réelles (celle-ci incluse).
  const attempts = await missedAttemptsFor(investorId);
  const proposal = proposeNextAction({
    outcome: input.outcome,
    reachedResult: input.reachedResult ?? null,
    missedAttempts: Math.max(attempts, 1),
    now,
  });

  // 3. Étape : entrée dans le suivi + rangement. La suite pose l'étape quand
  //    elle est une décision (intéressé, clos, pause) ; sinon la règle
  //    automatique s'applique, qui ne redescend jamais une fiche avancée.
  const scored = await getInvestorScored(investorId);
  await enterPipeline(investorId, queueSourceKey(scored?.scored.queueBucket));
  const explicit =
    proposal.stage && EXPLICIT_STAGES.has(proposal.stage) ? proposal.stage : undefined;
  const moved = await applyQualification(investorId, input.outcome, explicit, userId);

  // 4. Une seule action ouverte : on solde les précédentes, on pose la nouvelle.
  await db
    .update(closerTasks)
    .set({ status: 'done', completedAt: now })
    .where(and(eq(closerTasks.investorId, investorId), eq(closerTasks.status, 'pending')));

  let nextTaskId: string | null = null;
  const dueAt = input.next.dueAt ?? proposal.dueAt;
  if (input.next.kind !== 'none' && dueAt) {
    const task = await db
      .insert(closerTasks)
      .values({
        investorId,
        closerId: userId,
        type: input.next.kind,
        dueAt,
        note: input.next.note?.trim() || input.note?.trim() || null,
        createdBy: userId,
      })
      .returning({ id: closerTasks.id });
    nextTaskId = task[0]?.id ?? null;
  }

  // 5. Verrou rendu (le nôtre seulement) ; propriété collante si la personne est libre.
  const cutoff = new Date(now.getTime() - CLAIM_TTL_MIN * 60_000);
  await db
    .update(investors)
    .set({ claimedById: null, claimedAt: null })
    .where(
      and(
        eq(investors.id, investorId),
        or(
          isNull(investors.claimedById),
          eq(investors.claimedById, userId),
          lt(investors.claimedAt, cutoff),
        ),
      ),
    );
  await db
    .update(investors)
    .set({ assignedCloserId: userId, updatedAt: sql`now()` })
    .where(and(eq(investors.id, investorId), isNull(investors.assignedCloserId)));

  return { ok: true, interactionId, moved, proposal, nextTaskId };
}
