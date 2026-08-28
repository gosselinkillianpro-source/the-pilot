'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { setStage } from '@/lib/db/queries/webinar-pipeline';
import { rdvContacts } from '@/lib/db/schema';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';
import { ALL_STAGES, stageColumn } from '@/lib/webinars/pipeline';

/**
 * Déplacements de cartes dans le tableau de suivi.
 *
 * Le geste du closer fait autorité : il peut ramener une carte en arrière s'il
 * s'est trompé de colonne. C'est lui qui a eu la personne au téléphone.
 */

const moveSchema = z.object({
  contactId: z.string().uuid(),
  stage: z.enum(ALL_STAGES as [string, ...string[]]),
});

export async function moveCardAction(input: z.infer<typeof moveSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = moveSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  const stage = parsed.stage as (typeof ALL_STAGES)[number];
  const existing = await db
    .select({ id: rdvContacts.id, stage: rdvContacts.pipelineStage })
    .from(rdvContacts)
    .where(eq(rdvContacts.id, parsed.contactId))
    .limit(1);

  if (!existing[0]) {
    return { success: false, error: 'Fiche introuvable.' };
  }
  if (existing[0].stage === stage) {
    // Rien à faire : la carte est déjà là (glisser-déposer sur sa propre colonne).
    return { success: true };
  }

  await setStage(parsed.contactId, stage);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.pipeline_moved',
    resourceType: 'rdv_contact',
    resourceId: parsed.contactId,
    metadata: { de: existing[0].stage, vers: stage },
  });

  revalidatePath('/webinaires/suivi');
  await notifyChange(SYNC_TOPICS.webinars);
  return { success: true, label: stageColumn(stage).label };
}
