import 'server-only';
import type { Tx } from '@/lib/db/session';
import { isTelegramConfigured, sendTelegram } from '@/lib/integrations/telegram';
import { logNotification } from '@/lib/notifications/log';
import { alertRecipientsFor } from './recipients';

/** Envoie un message Telegram à tous les setters de garde de la source (+ admins), et trace chaque envoi. */
export async function broadcastTelegram(
  tx: Tx,
  sourceId: string,
  html: string,
  template: string,
  leadId: string,
  options: { includeAdmins?: boolean } = {},
): Promise<number> {
  const recipients = await alertRecipientsFor(tx, sourceId, {
    includeAdmins: options.includeAdmins ?? true,
  });
  if (!isTelegramConfigured() || recipients.length === 0) {
    await logNotification(tx, {
      channel: 'telegram',
      template,
      recipientMasked: recipients.length
        ? `${recipients.length} destinataire(s)`
        : 'aucun destinataire',
      leadId,
      status: 'skipped',
      error: isTelegramConfigured()
        ? 'aucun setter de garde avec Telegram'
        : 'TELEGRAM_BOT_TOKEN absent',
    });
    return 0;
  }
  let sent = 0;
  for (const r of recipients) {
    const res = await sendTelegram(r.telegramChatId, html);
    if (res.ok) sent++;
    await logNotification(tx, {
      channel: 'telegram',
      template,
      recipientMasked: r.email.replace(/^(.).*@/, '$1•••@'),
      leadId,
      userId: r.id,
      status: res.ok ? 'sent' : 'failed',
      error: res.ok ? null : res.error,
    });
  }
  return sent;
}
