import 'server-only';
import { getEmailConfig } from '@/lib/email/config';
import { sendTransactionalEmail } from '@/lib/integrations/brevo/send';
import { type InvitationEmailInput, invitationSubject, renderInvitationEmail } from './email';

export type InvitationSendResult = { sentTo: string; testMode: boolean };

/**
 * Envoie l'e-mail d'invitation via Brevo. Même garde-fou que tout envoi de
 * l'app : en EMAIL_TEST_MODE, le message part à l'adresse de test, préfixé.
 * L'expéditeur est celui de l'app (validé côté Brevo), jamais une adresse libre.
 */
export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<InvitationSendResult> {
  const cfg = getEmailConfig();
  if (cfg.testMode && !cfg.testAddress) {
    throw new Error('EMAIL_TEST_MODE actif sans EMAIL_TEST_ADDRESS : envoi impossible.');
  }
  const to = cfg.testMode ? cfg.testAddress : input.email;
  await sendTransactionalEmail({
    to: [{ email: to, name: input.fullName ?? undefined }],
    subject: `${cfg.testMode ? '[TEST] ' : ''}${invitationSubject()}`,
    htmlContent: renderInvitationEmail(input),
    senderName: 'THE PILOT · Seven At Home',
    senderAddress: cfg.senderAddress,
  });
  return { sentTo: to, testMode: cfg.testMode };
}
