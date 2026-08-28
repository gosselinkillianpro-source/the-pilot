'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { users } from '@/lib/db/schema';
import { isTelegramConfigured, sendTelegram } from '@/lib/notifications/telegram';

/**
 * Réglage des alertes « nouveau lead » par chaque closer.
 *
 * Chacun ne configure QUE son propre canal : l'identifiant est lu depuis la
 * session, jamais depuis le formulaire — sinon n'importe qui pourrait rediriger
 * les alertes d'un collègue vers sa propre conversation.
 */

const chatIdSchema = z.object({
  // Un identifiant Telegram est numérique (négatif pour un groupe). On refuse
  // le reste plutôt que d'enregistrer une valeur qui échouera silencieusement
  // à chaque envoi.
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{5,20}$/, 'Identifiant Telegram invalide (que des chiffres).')
    .or(z.literal('')),
});

export async function saveTelegramChatId(input: { chatId: string }) {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin', 'closer', 'closer_junior']);
  const parsed = chatIdSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Valeur invalide.' };
  }
  await ensureUserRecord(user);

  const value = parsed.data.chatId === '' ? null : parsed.data.chatId;
  await db.update(users).set({ telegramChatId: value }).where(eq(users.id, user.id));

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: value ? 'alerts.telegram_linked' : 'alerts.telegram_unlinked',
    resourceType: 'user',
    resourceId: user.id,
  });

  revalidatePath('/alertes');
  return { success: true };
}

/** Envoie un message de test : la seule façon de savoir que ça marche vraiment. */
export async function sendTestAlert() {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  if (!isTelegramConfigured()) {
    return { success: false, error: 'Le bot Telegram n’est pas configuré côté serveur.' };
  }
  const rows = await db
    .select({ chatId: users.telegramChatId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const chatId = rows[0]?.chatId;
  if (!chatId) return { success: false, error: 'Renseigne d’abord ton identifiant Telegram.' };

  const res = await sendTelegram(
    chatId,
    [
      '✅ <b>THE PILOT — test d’alerte</b>',
      '',
      'Si tu lis ce message, tu recevras les nouveaux leads BREACH ici,',
      'avec le numéro à rappeler. Objectif : rappeler dans les 5 minutes.',
    ].join('\n'),
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true };
}
