'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { getEmailConfig } from '@/lib/email/config';
import { renderEmailTemplate } from '@/lib/email/template';
import { createBrevoCampaign, sendBrevoCampaignNow } from '@/lib/integrations/brevo/send';

const WRITERS = ['admin', 'closer'] as const;

const createSchema = z.object({
  name: z.string().min(1, 'Nom de campagne requis.').max(150),
  subject: z.string().min(1, 'Objet requis.').max(200),
  title: z.string().max(200).optional(),
  bodyText: z.string().min(1, 'Message requis.'),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().optional(),
  listId: z.number({ message: 'Liste destinataire requise.' }),
});

export type CampaignResult =
  | { ok: true; campaignId: number; draft: boolean }
  | { ok: false; reason: 'amf'; issues: { match: string; suggestedFix: string }[] }
  | { ok: false; reason: 'error'; message: string };

/**
 * Crée une campagne en BROUILLON dans Brevo (aucun envoi).
 * Scan AMF bloquant. L'envoi réel est une action séparée et gatée (sendCampaignAction).
 */
export async function createCampaignAction(
  input: z.infer<typeof createSchema>,
): Promise<CampaignResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: 'error', message: parsed.error.issues[0]?.message ?? 'Invalide.' };
  }
  const data = parsed.data;
  const config = getEmailConfig();

  const htmlContent = renderEmailTemplate({
    title: data.title,
    bodyText: data.bodyText,
    ctaLabel: data.ctaLabel,
    ctaUrl: data.ctaUrl,
  });

  const scan = scanAmfCompliance(`${data.subject}\n${htmlContent}`);
  if (!scan.compliant) {
    return {
      ok: false,
      reason: 'amf',
      issues: scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix })),
    };
  }

  try {
    const { id } = await createBrevoCampaign({
      name: data.name,
      subject: data.subject,
      htmlContent,
      senderName: config.senderName,
      senderAddress: config.senderAddress,
      listIds: [data.listId],
    });

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'campaign.create_draft',
      resourceType: 'campaign',
      resourceId: String(id),
      metadata: { name: data.name, listId: data.listId },
    });

    revalidatePath('/email');
    return { ok: true, campaignId: id, draft: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Échec.' };
  }
}

export type SendCampaignResult = { ok: true } | { ok: false; message: string };

/**
 * Envoie réellement une campagne (sortie du brouillon).
 * GARDE-FOU : refusé tant que EMAIL_TEST_MODE n'est pas explicitement à false.
 */
export async function sendCampaignAction(campaignId: number): Promise<SendCampaignResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);

  const config = getEmailConfig();
  if (config.testMode) {
    return {
      ok: false,
      message:
        "Mode test actif : l'envoi réel est bloqué. La campagne reste en brouillon dans Brevo. " +
        'Désactive EMAIL_TEST_MODE pour envoyer.',
    };
  }

  try {
    await sendBrevoCampaignNow(campaignId);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'campaign.send_now',
      resourceType: 'campaign',
      resourceId: String(campaignId),
    });
    revalidatePath('/email');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec.' };
  }
}
