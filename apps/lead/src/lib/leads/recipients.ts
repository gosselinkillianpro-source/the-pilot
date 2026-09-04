import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import type { Tx } from '@/lib/db/session';

export type AlertRecipient = {
  id: string;
  email: string;
  telegramChatId: string;
  role: 'admin' | 'setter';
};

/**
 * Qui reçoit les alertes d'une source : les setters de garde (`on_duty`) dont
 * le périmètre contient la source, plus les admins de garde. Il faut un
 * identifiant Telegram renseigné.
 */
export async function alertRecipientsFor(
  tx: Tx,
  sourceId: string,
  options: { includeAdmins?: boolean; onlyOnDuty?: boolean } = {},
): Promise<AlertRecipient[]> {
  const rows = await tx
    .select()
    .from(users)
    .where(and(eq(users.active, true), isNotNull(users.telegramChatId)));
  const onlyOnDuty = options.onlyOnDuty ?? true;
  const out: AlertRecipient[] = [];
  for (const u of rows) {
    if (!u.telegramChatId) continue;
    if (onlyOnDuty && !u.onDuty) continue;
    if (u.role === 'setter' && !u.sourceIds.includes(sourceId)) continue;
    if (u.role === 'admin' && options.includeAdmins === false) continue;
    if (u.role === 'buyer') continue;
    out.push({ id: u.id, email: u.email, telegramChatId: u.telegramChatId, role: u.role });
  }
  return out;
}
