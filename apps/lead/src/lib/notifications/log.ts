import 'server-only';
import { notifications } from '@/lib/db/schema';
import type { Tx } from '@/lib/db/session';

export type NotificationLog = {
  channel: 'sms' | 'email' | 'telegram';
  template: string;
  recipientMasked: string;
  leadId?: string | null;
  appointmentId?: string | null;
  userId?: string | null;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string | null;
  error?: string | null;
};

/** Trace de chaque envoi sortant : preuve (critère d'acceptation 2) et diagnostic. */
export async function logNotification(tx: Tx, n: NotificationLog): Promise<void> {
  await tx.insert(notifications).values({
    channel: n.channel,
    template: n.template,
    recipientMasked: n.recipientMasked,
    leadId: n.leadId ?? null,
    appointmentId: n.appointmentId ?? null,
    userId: n.userId ?? null,
    status: n.status,
    providerMessageId: n.providerMessageId ?? null,
    error: n.error ?? null,
  });
}
