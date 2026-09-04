import 'server-only';
import { isSmsTestMode, optionalEnv } from '@/lib/env';
import { brevoPost, isBrevoConfigured } from './client';

/**
 * SMS transactionnels Brevo (compte Breach / MEP). En mode test (défaut), tout
 * SMS part vers SMS_TEST_NUMBER, ou est simplement journalisé s'il n'y a pas
 * de numéro de test : impossible d'envoyer un vrai SMS à un vrai lead par
 * accident depuis un poste de dev.
 */
export type SmsResult =
  | { ok: true; messageId: string | null; redirectedTo: string | null }
  | { ok: false; error: string; skipped?: boolean };

const SMS_MAX_CHARS = 480; // 3 segments GSM-7 : au-delà, c'est un email.

export async function sendSms(input: {
  to: string;
  content: string;
  tag: string;
}): Promise<SmsResult> {
  if (!isBrevoConfigured()) return { ok: false, error: 'BREVO_API_KEY absente', skipped: true };
  const sender = optionalEnv('SMS_SENDER') ?? 'MonExpert';
  const content = input.content.slice(0, SMS_MAX_CHARS);

  let recipient = input.to;
  let redirectedTo: string | null = null;
  if (isSmsTestMode()) {
    const test = optionalEnv('SMS_TEST_NUMBER');
    if (!test)
      return {
        ok: false,
        error: 'SMS_TEST_MODE actif sans SMS_TEST_NUMBER : envoi non effectué',
        skipped: true,
      };
    recipient = test;
    redirectedTo = test;
  }

  try {
    const res = await brevoPost<{ messageId?: number | string }>('/transactionalSMS/send', {
      sender,
      recipient: recipient.replace(/^\+/, ''),
      content,
      type: 'transactional',
      tag: input.tag,
      unicodeEnabled: true,
    });
    return { ok: true, messageId: res.messageId ? String(res.messageId) : null, redirectedTo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
