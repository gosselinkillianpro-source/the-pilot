'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { CLOSING_STAGE_LABELS, type ClosingStage, isClosingStage } from '@/lib/closing/pipeline';
import { setClosingStage } from '@/lib/db/queries/closing-pipeline';

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

export async function moveClosingCardAction(input: { investorId: string; stage: string }) {
  const user = await getAuthenticatedUser();
  const parsed = moveSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  const stage = parsed.stage as ClosingStage;
  await setClosingStage(parsed.investorId, stage);

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
  revalidatePath('/closing/queue');
  return { success: true, label: CLOSING_STAGE_LABELS[stage] };
}
