'use server';

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
import { getInvestableProjects, getInvestorById } from '@/lib/db/queries/investors';

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
