'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { getClubDeal } from '@/lib/club-deal';
import { PROCESSING_CODES } from '@/lib/club-deal/constants';

/**
 * Suivi d'une manifestation d'intérêt club deal (statut de traitement, notes
 * internes) — admin seulement. Passe par `updateProcessing` du module club deal.
 */

const schema = z
  .object({
    id: z.number().int().positive(),
    processingStatus: z.enum(PROCESSING_CODES as [string, ...string[]]).optional(),
    notes: z.string().max(4000, 'Notes trop longues (4 000 caractères max).').optional(),
  })
  .refine((v) => v.processingStatus !== undefined || v.notes !== undefined, 'Rien à enregistrer.');

export type UpdateClubDealInput = z.infer<typeof schema>;
export type UpdateClubDealResult = { ok: true } | { ok: false; message: string };

export async function updateClubDealAction(
  input: UpdateClubDealInput,
): Promise<UpdateClubDealResult> {
  const user = await getAuthenticatedUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Saisie invalide.' };
  }
  await requireRole(user, ['admin']);

  const { id, processingStatus, notes } = parsed.data;
  const row = await getClubDeal().updateProcessing(id, {
    processing_status: processingStatus ?? null,
    notes: notes ?? null,
  });
  if (!row) return { ok: false, message: 'Demande introuvable (supprimée ?).' };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'club_deal.update',
    resourceType: 'club_deal_interests',
    resourceId: String(id),
    metadata: { processingStatus, notesChanged: notes !== undefined },
  });
  revalidatePath('/club-deal');
  revalidatePath(`/club-deal/${id}`);
  return { ok: true };
}
