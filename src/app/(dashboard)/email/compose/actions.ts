'use server';

import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailConfig } from '@/lib/email/config';
import { renderEmailTemplate, renderPersonalEmail } from '@/lib/email/template';
import {
  addContactsToList,
  createBrevoList,
  ensureContacts,
  sendTransactionalEmail,
} from '@/lib/integrations/brevo/send';

const schema = z.object({
  mode: z.enum(['people', 'list', 'group']),
  subject: z.string().min(1, 'Objet requis').max(200),
  title: z.string().max(200).optional(),
  bodyText: z.string().min(1, 'Message requis'),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().optional(),
  emails: z.array(z.string().email()).optional(),
  listId: z.number().optional(),
  listName: z.string().optional(),
  groupName: z.string().optional(),
  groupEmails: z.array(z.string().email()).optional(),
  // 'brand' = template de marque (campagnes) ; 'personal' = rendu épuré 1-à-1 (closers)
  variant: z.enum(['brand', 'personal']).optional(),
});

export type SendEmailInput = z.infer<typeof schema>;

export type SendEmailResult =
  | { ok: true; testMode: boolean; description: string; recipientCount: number; sentTo: string }
  | { ok: false; reason: 'amf'; issues: { match: string; suggestedFix: string }[] }
  | { ok: false; reason: 'error'; message: string };

export async function sendEmailAction(input: SendEmailInput): Promise<SendEmailResult> {
  // 1. Auth best-effort (le login arrive plus tard)
  let actorId: string | null = null;
  let actorEmail = 'dev-local';
  try {
    const user = await getAuthenticatedUser();
    actorId = user.id;
    actorEmail = user.email;
    // TODO (login) : await requireRole(user, ['admin', 'closer'])
  } catch {
    // pas de session encore — en mode test, sans risque
  }

  // 2. Validation
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'error',
      message: parsed.error.issues[0]?.message ?? 'Entrée invalide',
    };
  }
  const data = parsed.data;
  const config = getEmailConfig();

  // 3. Rendu du template final selon la variante (marque vs personnel 1-à-1)
  const renderHtml = (notice?: string) =>
    data.variant === 'personal'
      ? renderPersonalEmail({ bodyText: data.bodyText, notice })
      : renderEmailTemplate({
          title: data.title,
          bodyText: data.bodyText,
          ctaLabel: data.ctaLabel,
          ctaUrl: data.ctaUrl,
          notice,
        });
  const htmlContent = renderHtml();

  // 4. Scan AMF (bloquant) sur l'email final — le footer fournit déjà le disclaimer requis
  const scan = scanAmfCompliance(`${data.subject}\n${htmlContent}`);
  if (!scan.compliant) {
    return {
      ok: false,
      reason: 'amf',
      issues: scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix })),
    };
  }

  try {
    // 5. Résolution des destinataires
    let description = '';
    let recipientCount = 0;
    let realRecipients: { email: string }[] = [];

    if (data.mode === 'people') {
      const emails = data.emails ?? [];
      if (emails.length === 0)
        return { ok: false, reason: 'error', message: 'Aucune adresse renseignée' };
      realRecipients = emails.map((email) => ({ email }));
      recipientCount = emails.length;
      description = emails.length === 1 ? (emails[0] ?? '') : `${emails.length} personnes`;
    } else if (data.mode === 'group') {
      const groupEmails = data.groupEmails ?? [];
      const groupName = data.groupName?.trim();
      if (!groupName) return { ok: false, reason: 'error', message: 'Nom du groupe requis' };
      if (groupEmails.length === 0)
        return { ok: false, reason: 'error', message: 'Aucun contact dans le groupe' };
      const list = await createBrevoList(`${groupName} (THE PILOT)`);
      await ensureContacts(groupEmails);
      await addContactsToList(list.id, groupEmails);
      recipientCount = groupEmails.length;
      realRecipients = groupEmails.map((email) => ({ email }));
      description = `nouveau groupe « ${groupName} » (${groupEmails.length} contacts)`;
    } else {
      if (!data.listId) return { ok: false, reason: 'error', message: 'Aucune liste sélectionnée' };
      description = `liste « ${data.listName ?? data.listId} »`;
    }

    // 6. Garde-fou MODE TEST
    let sentTo: string;
    if (config.testMode) {
      if (!config.testAddress) {
        return { ok: false, reason: 'error', message: 'EMAIL_TEST_ADDRESS non configurée' };
      }
      const testHtml = renderHtml(
        `[MODE TEST] Cet email serait parti à : ${description}. Aucun vrai destinataire contacté.`,
      );
      await sendTransactionalEmail({
        to: [{ email: config.testAddress }],
        subject: `[TEST] ${data.subject}`,
        htmlContent: testHtml,
        senderName: config.senderName,
        senderAddress: config.senderAddress,
      });
      sentTo = config.testAddress;
    } else {
      if (data.mode === 'list') {
        return {
          ok: false,
          reason: 'error',
          message:
            "Envoi réel à une liste : passe d'abord par le mode test. La campagne réelle sera activée ensuite.",
        };
      }
      await sendTransactionalEmail({
        to: realRecipients,
        subject: data.subject,
        htmlContent,
        senderName: config.senderName,
        senderAddress: config.senderAddress,
      });
      sentTo = description;
    }

    // 7. Audit
    await logAudit({
      userId: actorId,
      userEmail: actorEmail,
      action: 'email.send',
      resourceType: 'email',
      resourceId: data.mode,
      metadata: {
        mode: data.mode,
        subject: data.subject,
        testMode: config.testMode,
        description,
        recipientCount,
      },
    });

    return { ok: true, testMode: config.testMode, description, recipientCount, sentTo };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Erreur envoi' };
  }
}
