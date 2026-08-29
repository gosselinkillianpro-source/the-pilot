'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { CLOSING_STAGE_LABELS, type ClosingStage, isClosingStage } from '@/lib/closing/pipeline';
import { setClosingStage } from '@/lib/db/queries/closing-pipeline';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

/**
 * Déplacements de cartes dans le tableau de suivi des appels.
 *
 * Le geste du closer fait autorité, y compris pour ramener une carte en
 * arrière : c'est lui qui a eu la personne au téléphone, pas la règle.
 */

const moveSchema = z.object({
  investorId: z.string().uuid(),
  stage: z.string().refine(isClosingStage, 'Colonne inconnue.'),
});

export type MoveCardResult = { success: true; label: string } | { success: false; error: string };

export async function moveClosingCardAction(input: {
  investorId: string;
  stage: string;
}): Promise<MoveCardResult> {
  // Tout échec doit revenir en { success: false } : une action serveur qui
  // JETTE fait sauter la page du closer vers l'écran d'erreur — la carte
  // semblait déplacée (optimiste) alors que rien n'était écrit.
  let parsed: z.infer<typeof moveSchema>;
  try {
    parsed = moveSchema.parse(input);
  } catch {
    return { success: false, error: 'Colonne inconnue.' };
  }
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'closer', 'closer_junior']);
  } catch {
    return { success: false, error: 'Déplacement réservé aux closers (lecture seule direction).' };
  }

  try {
    const stage = parsed.stage as ClosingStage;
    await setClosingStage(parsed.investorId, stage, user.id);

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'closing.pipeline_moved',
      resourceType: 'investor',
      resourceId: parsed.investorId,
      metadata: { vers: stage },
    });

    revalidatePath('/closing/pipeline');
    revalidatePath('/closing/mes-leads');
    revalidatePath('/closing/queue');
    await notifyChange(SYNC_TOPICS.closing);
    return { success: true, label: CLOSING_STAGE_LABELS[stage] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Déplacement impossible.' };
  }
}
