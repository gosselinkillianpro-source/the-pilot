'use server';

import { z } from 'zod';
import { resolveSignedLink } from '@/lib/crypto/signed-links';
import { asSystem } from '@/lib/db/session';
import { zonedTimeToUtc } from '@/lib/domain/time';
import { requestCallbackViaLink } from '@/lib/leads/qualification';

export type SlotState = { error?: string; ok?: string } | null;

const schema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(['matin', 'apres-midi', 'fin-journee']),
});

const SLOT_START: Record<z.infer<typeof schema>['slot'], { hour: number; minute: number }> = {
  matin: { hour: 9, minute: 0 },
  'apres-midi': { hour: 14, minute: 0 },
  'fin-journee': { hour: 17, minute: 30 },
};

/** Le lead choisit un moment de rappel depuis le lien SMS ; le lien est consommé. */
export async function chooseSlotAction(
  token: string,
  _prev: SlotState,
  fd: FormData,
): Promise<SlotState> {
  const parsed = schema.safeParse({ day: fd.get('day'), slot: fd.get('slot') });
  if (!parsed.success) return { error: 'Choisissez un jour et un moment.' };
  const link = await asSystem((tx) => resolveSignedLink(tx, token, 'slot_pick', { consume: true }));
  if (!link?.leadId) return { error: 'Ce lien a expiré ou a déjà été utilisé.' };
  const [y, m, d] = parsed.data.day.split('-').map(Number);
  const start = SLOT_START[parsed.data.slot];
  const at = zonedTimeToUtc({
    year: y ?? 0,
    month: m ?? 1,
    day: d ?? 1,
    hour: start.hour,
    minute: start.minute,
  });
  if (at.getTime() < Date.now() - 60 * 60000) return { error: 'Ce créneau est déjà passé.' };
  try {
    await requestCallbackViaLink(link.leadId, at);
  } catch {
    return {
      error:
        'Votre demande n’a pas pu être enregistrée : un conseiller vous rappellera de toute façon.',
    };
  }
  return { ok: 'C’est noté : un conseiller vous rappelle sur ce créneau.' };
}
