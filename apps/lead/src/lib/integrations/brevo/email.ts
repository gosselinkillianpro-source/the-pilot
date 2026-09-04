import 'server-only';
import { isEmailTestMode, optionalEnv } from '@/lib/env';
import { brevoPost, isBrevoConfigured } from './client';

export type EmailResult =
  | { ok: true; messageId: string | null; redirectedTo: string | null }
  | { ok: false; error: string; skipped?: boolean };

export async function sendEmail(input: {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  tag: string;
}): Promise<EmailResult> {
  if (!isBrevoConfigured()) return { ok: false, error: 'BREVO_API_KEY absente', skipped: true };
  const senderName = optionalEnv('EMAIL_SENDER_NAME') ?? 'MonExpertPatrimoine';
  const senderAddress = optionalEnv('EMAIL_SENDER_ADDRESS');
  if (!senderAddress) return { ok: false, error: 'EMAIL_SENDER_ADDRESS absente', skipped: true };

  let to = input.to;
  let redirectedTo: string | null = null;
  let subject = input.subject;
  if (isEmailTestMode()) {
    const test = optionalEnv('EMAIL_TEST_ADDRESS');
    if (!test)
      return {
        ok: false,
        error: 'EMAIL_TEST_MODE actif sans EMAIL_TEST_ADDRESS : envoi non effectué',
        skipped: true,
      };
    to = { email: test, name: input.to.name };
    redirectedTo = test;
    subject = `[TEST → ${input.to.email}] ${subject}`;
  }

  try {
    const res = await brevoPost<{ messageId?: string }>('/smtp/email', {
      sender: { name: senderName, email: senderAddress },
      to: [to],
      subject,
      htmlContent: input.html,
      tags: [input.tag],
    });
    return { ok: true, messageId: res.messageId ?? null, redirectedTo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
