'use server';

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
import { type AuthenticatedUser, getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { getInvestableProjects, getInvestorById } from '@/lib/db/queries/investors';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { interactions } from '@/lib/db/schema';
import { sendEmailAction } from '../compose/actions';

const genSchema = z.object({
  investorId: z.string().uuid(),
  type: z.enum(['rebound', 'dormant']),
  reboundAmount: z.number().optional(),
});

export type RelanceDraft = { subject: string; preheader: string; body: string };

export type GenerateRelanceResult =
  | {
      ok: true;
      draft: RelanceDraft;
      amf: { compliant: boolean; issues: { match: string; suggestedFix: string }[] };
      costEur: number;
    }
  | { ok: false; message: string };

async function requireAdmin(): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin']);
  } catch {
    return null;
  }
  return user;
}

/** Génère un brouillon d'email de relance (rebond/endormi). Réservé admin. NE L'ENVOIE PAS. */
export async function generateRelanceEmailAction(input: {
  investorId: string;
  type: 'rebound' | 'dormant';
  reboundAmount?: number;
}): Promise<GenerateRelanceResult> {
  let parsed: z.infer<typeof genSchema>;
  try {
    parsed = genSchema.parse(input);
  } catch {
    return { ok: false, message: 'Paramètres invalides.' };
  }
  const user = await requireAdmin();
  if (!user) return { ok: false, message: 'Action réservée à l’admin.' };
  await ensureUserRecord(user);

  const investor = await getInvestorById(parsed.investorId);
  if (!investor) return { ok: false, message: 'Investisseur introuvable.' };

  const investorContext: InvestorContext = {
    firstName: investor.firstName ?? investor.fullName?.split(' ')[0] ?? 'Investisseur',
    segment: investor.profileSegment ?? 'particulier',
    score: investor.score ?? 0,
    stage: investor.pipelineStage,
    totalInvested: Number(investor.totalInvested ?? 0),
    // Pour le rebond, on indique le montant qui se libère (cadre le réinvestissement).
    amountMentioned: parsed.type === 'rebound' ? parsed.reboundAmount : undefined,
  };
  const projects: ProjectContext[] = (await getInvestableProjects()).map((p) => ({
    name: p.name,
    city: p.city ?? '',
    targetYieldAnnual: Number(p.targetYieldAnnual ?? 0),
    durationMonths: p.durationMonths ?? 0,
    status: p.status,
  }));

  try {
    const result = await draftProposalEmail(investorContext, projects);
    const { subject, preheader, bodyText } = result.draft;
    const scan = scanAmfCompliance(`${subject}\n${bodyText}`);
    const costEur = estimateCostEur(result.model, result.promptTokens, result.completionTokens);

    await logLlmCall({
      userId: user.id,
      model: result.model,
      purpose: `relance_${parsed.type}`,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      status: 'success',
      inputSummary: `relance ${parsed.type} ${investor.email}`,
      outputSummary: subject.slice(0, 200),
    });

    return {
      ok: true,
      draft: { subject, preheader, body: bodyText },
      amf: {
        compliant: scan.compliant,
        issues: scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix })),
      },
      costEur,
    };
  } catch (e) {
    if (e instanceof MissingAnthropicKeyError) {
      return { ok: false, message: 'Clé IA absente (ANTHROPIC_API_KEY).' };
    }
    return { ok: false, message: e instanceof Error ? e.message : 'Erreur de génération.' };
  }
}

const sendSchema = z.object({
  investorId: z.string().uuid(),
  type: z.enum(['rebound', 'dormant']),
  subject: z.string().trim().min(1).max(200),
  preheader: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1),
});

export type ApproveRelanceResult =
  | { ok: true; testMode: boolean; sentTo: string }
  | { ok: false; message: string }
  | { ok: false; amf: { match: string; suggestedFix: string }[] };

/** Approuve + envoie l'email de relance (admin uniquement). Passe par le scan AMF
 *  + le mode test Brevo. Trace un événement email_sent sur la fiche. */
export async function approveAndSendRelanceAction(input: {
  investorId: string;
  type: 'rebound' | 'dormant';
  subject: string;
  preheader?: string;
  body: string;
}): Promise<ApproveRelanceResult> {
  let parsed: z.infer<typeof sendSchema>;
  try {
    parsed = sendSchema.parse(input);
  } catch {
    return { ok: false, message: 'Email invalide (objet et corps requis).' };
  }
  const user = await requireAdmin();
  if (!user) return { ok: false, message: 'Action réservée à l’admin.' };

  const investor = await getInvestorById(parsed.investorId);
  if (!investor?.email) {
    return { ok: false, message: 'Investisseur ou email introuvable.' };
  }

  const res = await sendEmailAction({
    mode: 'people',
    emails: [investor.email],
    subject: parsed.subject,
    bodyText: parsed.body,
    preheader: parsed.preheader,
    variant: 'personal',
  });

  if (!res.ok) {
    if (res.reason === 'amf') return { ok: false, amf: res.issues };
    return { ok: false, message: res.message };
  }

  // Trace de l'envoi sur la fiche (best-effort) — sert aussi à l'anti-spam des relances.
  try {
    await db.insert(interactions).values({
      investorId: parsed.investorId,
      type: 'email_sent',
      userId: user.id,
    });
  } catch (e) {
    console.error('relance interaction log failed:', e instanceof Error ? e.message : e);
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: `relance.${parsed.type}.sent`,
    resourceType: 'investor',
    resourceId: parsed.investorId,
    metadata: { subject: parsed.subject, testMode: res.testMode },
  });

  return { ok: true, testMode: res.testMode, sentTo: res.sentTo };
}
