'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { estimateCostEur } from '@/lib/ai/anthropic';
import {
  draftProposalEmail,
  type InvestorContext,
  MissingAnthropicKeyError,
  type ProjectContext,
} from '@/lib/ai/investor-emails';
import { logLlmCall } from '@/lib/ai/log-llm';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { getInvestableProjects, getInvestorById } from '@/lib/db/queries/investors';
import { closerTasks, interactions, investors } from '@/lib/db/schema';

export type DraftProposalResult =
  | {
      ok: true;
      subject: string;
      preheader: string;
      bodyText: string;
      costEur: number;
      amfWarnings: { match: string; suggestedFix: string }[];
    }
  | { ok: false; reason: 'no_key' | 'not_found' | 'error'; message: string };

/**
 * Génère (sans l'envoyer) un brouillon d'email de proposition pour un investisseur,
 * calé sur son score / sa situation et les projets réellement disponibles.
 * L'envoi reste une action séparée et validée par un humain (sendEmailAction).
 */
export async function draftProposalEmailAction(investorId: string): Promise<DraftProposalResult> {
  // 1. Auth + permission (closers et admin uniquement ; direction = lecture seule)
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  // 2. Données investisseur réelles (synchronisées depuis SAH)
  const investor = await getInvestorById(investorId);
  if (!investor) {
    return { ok: false, reason: 'not_found', message: 'Investisseur introuvable.' };
  }

  const investorContext: InvestorContext = {
    firstName: investor.firstName ?? investor.fullName?.split(' ')[0] ?? 'Investisseur',
    segment: investor.profileSegment ?? 'particulier',
    score: investor.score ?? 0,
    stage: investor.pipelineStage,
    totalInvested: Number(investor.totalInvested ?? 0),
    amountMentioned: undefined,
  };

  // 3. Projets investissables (ouverts à la collecte), vrais projets SAH
  const projects: ProjectContext[] = (await getInvestableProjects()).map((p) => ({
    name: p.name,
    city: p.city ?? '',
    targetYieldAnnual: Number(p.targetYieldAnnual ?? 0),
    durationMonths: p.durationMonths ?? 0,
    status: p.status,
  }));

  // 4. Génération IA (+ journalisation LLM dans tous les cas)
  try {
    const result = await draftProposalEmail(investorContext, projects);

    await logLlmCall({
      userId: user.id,
      model: result.model,
      purpose: 'investor_proposal_email',
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      status: 'success',
      inputSummary: `proposal for ${investor.id} (score ${investor.score})`,
      outputSummary: result.draft.subject,
    });

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'ai.draft_proposal_email',
      resourceType: 'investor',
      resourceId: investor.id,
    });

    // 5. Scan AMF du brouillon (avertissement non bloquant ici : l'humain corrige,
    //    et l'envoi (sendEmailAction) re-scanne et bloque pour de bon si besoin).
    const scan = scanAmfCompliance(
      `${result.draft.subject}\n${result.draft.preheader}\n${result.draft.bodyText}`,
    );
    const amfWarnings = scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix }));

    return {
      ok: true,
      subject: result.draft.subject,
      preheader: result.draft.preheader,
      bodyText: result.draft.bodyText,
      costEur: estimateCostEur(result.model, result.promptTokens, result.completionTokens),
      amfWarnings,
    };
  } catch (e) {
    if (e instanceof MissingAnthropicKeyError) {
      return {
        ok: false,
        reason: 'no_key',
        message:
          'Clé IA absente : ajoute ANTHROPIC_API_KEY dans .env.local puis relance le serveur.',
      };
    }
    const message = e instanceof Error ? e.message : 'Erreur de génération.';
    await logLlmCall({
      userId: user.id,
      model: 'claude-opus-4-7',
      purpose: 'investor_proposal_email',
      status: 'error',
      errorMessage: message,
      inputSummary: `proposal for ${investor.id}`,
    });
    return { ok: false, reason: 'error', message };
  }
}

/* ============================================================
   Enregistrement d'appel + rappels (boucle de travail closer)
   ============================================================ */

const PIPELINE_STAGES = [
  'new',
  'contacted',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dormant',
] as const;

const logCallSchema = z.object({
  investorId: z.string().uuid(),
  outcome: z.enum(['reached', 'no_answer', 'voicemail', 'wrong_number', 'callback_scheduled']),
  note: z.string().trim().max(4000).optional(),
  nextStage: z.enum(PIPELINE_STAGES).optional(),
  callbackAt: z.string().datetime({ offset: true }).optional(),
});

export type LogCallInput = z.infer<typeof logCallSchema>;
export type CallActionResult = { ok: true } | { ok: false; message: string };

/** Enregistre un appel : interaction + (option) rappel programmé + (option) étape pipeline. */
export async function logCallAction(input: LogCallInput): Promise<CallActionResult> {
  let parsed: LogCallInput;
  try {
    parsed = logCallSchema.parse(input);
  } catch {
    return { ok: false, message: 'Données invalides.' };
  }

  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'closer', 'closer_junior']);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }

  try {
    // 1. L'appel lui-même (alimente timeline + attribution)
    await db.insert(interactions).values({
      investorId: parsed.investorId,
      type: 'call_outbound',
      outcome: parsed.outcome,
      note: parsed.note ?? null,
      userId: user.id,
    });

    // 2. Rappel programmé (optionnel)
    if (parsed.callbackAt) {
      await db.insert(closerTasks).values({
        investorId: parsed.investorId,
        closerId: user.id,
        type: 'callback',
        dueAt: new Date(parsed.callbackAt),
        note: parsed.note ?? null,
        createdBy: user.id,
      });
    }

    // 3. Avancement pipeline (optionnel)
    if (parsed.nextStage) {
      await db
        .update(investors)
        .set({ pipelineStage: parsed.nextStage, pipelineStageUpdatedAt: new Date() })
        .where(eq(investors.id, parsed.investorId));
    }

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'closing.call_logged',
      resourceType: 'investor',
      resourceId: parsed.investorId,
      metadata: {
        outcome: parsed.outcome,
        callbackAt: parsed.callbackAt ?? null,
        nextStage: parsed.nextStage ?? null,
      },
    });

    revalidatePath(`/closing/investor/${parsed.investorId}`);
    revalidatePath('/closing/queue');
    revalidatePath('/closing/today');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'enregistrement." };
  }
}

const completeTaskSchema = z.object({ taskId: z.string().uuid() });

/** Marque un rappel/tâche comme fait. */
export async function completeTaskAction(input: { taskId: string }): Promise<CallActionResult> {
  let parsed: { taskId: string };
  try {
    parsed = completeTaskSchema.parse(input);
  } catch {
    return { ok: false, message: 'Données invalides.' };
  }

  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'closer', 'closer_junior']);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }

  try {
    await db
      .update(closerTasks)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(closerTasks.id, parsed.taskId));
    revalidatePath('/closing/today');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec.' };
  }
}
