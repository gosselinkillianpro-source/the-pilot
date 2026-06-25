'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { closerTasks, interactions, investors } from '@/lib/db/schema';

/**
 * Compte-rendu post-RDV : note libre + intention de dépôt (montant/fourchette/échéance)
 * + rappel programmé optionnel. Stocké dans les tables existantes (aucune migration) :
 * - `interactions` (type note_added) porte la note et le dépôt souhaité (value_numeric + metadata) ;
 * - `closer_tasks` porte le rappel (callback) qui alimente les relances intelligentes.
 */

const PIPELINE_STAGES = [
  'new',
  'contacted',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dormant',
] as const;

const schema = z
  .object({
    investorId: z.string().uuid(),
    note: z.string().trim().max(4000).optional(),
    depotMin: z.number().int().nonnegative().max(100_000_000).optional(),
    depotMax: z.number().int().nonnegative().max(100_000_000).optional(),
    depotQuand: z.string().trim().max(120).optional(),
    callbackAt: z.string().datetime({ offset: true }).optional(),
    nextStage: z.enum(PIPELINE_STAGES).optional(),
  })
  .refine((v) => v.depotMax == null || v.depotMin == null || v.depotMax >= v.depotMin, {
    message: 'Le maximum doit être ≥ au minimum.',
    path: ['depotMax'],
  });

export type RecordRdvOutcomeInput = z.infer<typeof schema>;
export type RdvOutcomeResult = { ok: true } | { ok: false; message: string };

export async function recordRdvOutcomeAction(
  input: RecordRdvOutcomeInput,
): Promise<RdvOutcomeResult> {
  let parsed: RecordRdvOutcomeInput;
  try {
    parsed = schema.parse(input);
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? (e.issues[0]?.message ?? 'Données invalides.')
        : 'Données invalides.';
    return { ok: false, message: msg };
  }

  // Au moins un champ utile renseigné.
  if (
    !parsed.note &&
    parsed.depotMin == null &&
    parsed.depotMax == null &&
    !parsed.depotQuand &&
    !parsed.callbackAt &&
    !parsed.nextStage
  ) {
    return {
      ok: false,
      message: 'Rien à enregistrer : ajoute au moins une note, un montant ou un rappel.',
    };
  }

  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'closer', 'closer_junior']);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }

  try {
    await ensureUserRecord(user);

    const hasDepot =
      parsed.depotMin != null || parsed.depotMax != null || Boolean(parsed.depotQuand);
    const valueNumeric =
      parsed.depotMin != null
        ? String(parsed.depotMin)
        : parsed.depotMax != null
          ? String(parsed.depotMax)
          : null;

    // 1. Compte-rendu (note + intention de dépôt) dans la timeline.
    await db.insert(interactions).values({
      investorId: parsed.investorId,
      type: 'note_added',
      note: parsed.note ?? null,
      valueNumeric,
      userId: user.id,
      metadata: hasDepot
        ? {
            kind: 'rdv_outcome',
            depotMin: parsed.depotMin ?? null,
            depotMax: parsed.depotMax ?? null,
            depotQuand: parsed.depotQuand ?? null,
          }
        : { kind: 'rdv_outcome' },
    });

    // 2. Rappel programmé optionnel.
    if (parsed.callbackAt) {
      await db.insert(closerTasks).values({
        investorId: parsed.investorId,
        closerId: user.id,
        type: 'callback',
        dueAt: new Date(parsed.callbackAt),
        note: parsed.note ?? (hasDepot ? `Dépôt souhaité ${parsed.depotQuand ?? ''}`.trim() : null),
        createdBy: user.id,
      });
    }

    // 3. Avancement pipeline optionnel.
    if (parsed.nextStage) {
      await db
        .update(investors)
        .set({ pipelineStage: parsed.nextStage, pipelineStageUpdatedAt: new Date() })
        .where(eq(investors.id, parsed.investorId));
    }

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'rdv.outcome_recorded',
      resourceType: 'investor',
      resourceId: parsed.investorId,
      metadata: {
        hasNote: Boolean(parsed.note),
        depotMin: parsed.depotMin ?? null,
        depotMax: parsed.depotMax ?? null,
        depotQuand: parsed.depotQuand ?? null,
        callbackAt: parsed.callbackAt ?? null,
        nextStage: parsed.nextStage ?? null,
      },
    });

    revalidatePath('/rdv');
    revalidatePath(`/closing/investor/${parsed.investorId}`);
    revalidatePath('/closing/suivi');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'enregistrement." };
  }
}
