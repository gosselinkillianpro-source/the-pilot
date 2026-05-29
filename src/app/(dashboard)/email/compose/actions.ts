'use server';

import { z } from 'zod';
import { scanAmfCompliance } from '@/lib/ai/amf-compliance';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser } from '@/lib/auth';
import { getEmailConfig } from '@/lib/email/config';
import {
  addContactsToList,
  createBrevoList,
  ensureContacts,
  sendTransactionalEmail,
} from '@/lib/integrations/brevo/send';

const schema = z.object({
  mode: z.enum(['people', 'list', 'group']),
  subject: z.string().min(1, 'Objet requis').max(200),
  htmlContent: z.string().min(1, 'Message requis'),
  emails: z.array(z.string().email()).optional(),
  listId: z.number().optional(),
  listName: z.string().optional(),
  groupName: z.string().optional(),
  groupEmails: z.array(z.string().email()).optional(),
});

export type SendEmailInput = z.infer<typeof schema>;

export type SendEmailResult =
  | { ok: true; testMode: boolean; description: string; recipientCount: number; sentTo: string }
  | { ok: false; reason: 'amf'; issues: { match: string; suggestedFix: string }[] }
  | { ok: false; reason: 'error'; message: string };

export async function sendEmailAction(input: SendEmailInput): Promise<SendEmailResult> {
  // 1. Auth (best-effort tant que le login n'est pas branché — voir TODO)
  let actorId: string | null = null;
  let actorEmail = 'dev-local';
  try {
    const user = await getAuthenticatedUser();
    actorId = user.id;
    actorEmail = user.email;
    // TODO (au branchement du login) : await requireRole(user, ['admin', 'closer'])
  } catch {
    // Pas encore de session (login à venir). En mode test c'est sans risque.
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

  // 3. Scan AMF (bloquant) — sujet + corps
  const scan = scanAmfCompliance(`${data.subject}\n${data.htmlContent}`);
  if (!scan.compliant) {
    return {
      ok: false,
      reason: 'amf',
      issues: scan.issues.map((i) => ({ match: i.match, suggestedFix: i.suggestedFix })),
    };
  }

  const config = getEmailConfig();

  try {
    // 4. Résoudre les destinataires + description lisible
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
      // Création du groupe = créer une liste Brevo + y ajouter les contacts (ne mail personne)
      const list = await createBrevoList(`${groupName} (THE PILOT)`);
      await ensureContacts(groupEmails);
      await addContactsToList(list.id, groupEmails);
      recipientCount = groupEmails.length;
      realRecipients = groupEmails.map((email) => ({ email }));
      description = `nouveau groupe « ${groupName} » (${groupEmails.length} contacts)`;
    } else {
      // mode 'list'
      if (!data.listId) return { ok: false, reason: 'error', message: 'Aucune liste sélectionnée' };
      recipientCount = 0; // on ne ré-énumère pas la liste ici
      description = `liste « ${data.listName ?? data.listId} »`;
    }

    // 5. Garde-fou MODE TEST : tout part vers l'adresse de test
    let sentTo: string;
    if (config.testMode) {
      if (!config.testAddress) {
        return { ok: false, reason: 'error', message: 'EMAIL_TEST_ADDRESS non configurée' };
      }
      const banner = `<div style="background:#FEF3C7;border:1px solid #F59E0B;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-family:sans-serif;font-size:13px;color:#78350F">
        <strong>[MODE TEST]</strong> Cet email serait parti à : <strong>${description}</strong>. Aucun vrai destinataire n'a été contacté.
      </div>`;
      await sendTransactionalEmail({
        to: [{ email: config.testAddress }],
        subject: `[TEST] ${data.subject}`,
        htmlContent: banner + data.htmlContent,
        senderName: config.senderName,
        senderAddress: config.senderAddress,
      });
      sentTo = config.testAddress;
    } else {
      // Envoi réel
      if (data.mode === 'list') {
        // En réel, l'envoi à une liste passe par une campagne Brevo (non implémenté dans ce 1er jet)
        return {
          ok: false,
          reason: 'error',
          message:
            "Envoi réel à une liste : passe d'abord par le mode test. La campagne réelle sera activée à l'étape suivante.",
        };
      }
      await sendTransactionalEmail({
        to: realRecipients,
        subject: data.subject,
        htmlContent: data.htmlContent,
        senderName: config.senderName,
        senderAddress: config.senderAddress,
      });
      sentTo = description;
    }

    // 6. Audit
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
