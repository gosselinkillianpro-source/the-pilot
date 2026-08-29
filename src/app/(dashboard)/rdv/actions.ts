'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { closerTasks, interactions, investors } from '@/lib/db/schema';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

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
    // L'étape pipeline écrite ici est celle que lit le board closing, et le
    // rappel alimente le cockpit du jour : sans revalidation ni signal, un
    // collègue voit l'ancienne étape jusqu'à 60 s et relance un lead déjà
    // traité (même motif que qualifyCallAction).
    revalidatePath('/closing/pipeline');
    revalidatePath('/closing/mes-leads');
    revalidatePath('/closing/today');
    await notifyChange(SYNC_TOPICS.closing);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'enregistrement." };
  }
}

/* ============================================================
   RAPPELS — un rendez-vous avec soi-même
   ============================================================ */

const reminderSchema = z.object({
  /** Cible : une fiche investisseur SAH, ou une fiche prospect. */
  targetId: z.string().uuid(),
  targetKind: z.enum(['investor', 'contact']),
  /** Date et heure locales du navigateur, converties en ISO à l'envoi. */
  dueAt: z.string().datetime(),
  note: z.string().trim().max(500).optional(),
  /**
   * Closer PROPRIÉTAIRE de l'agenda affiché. Quand un admin consulte l'agenda
   * d'un closer (?closer=), le rappel doit être posé chez ce closer — pas chez
   * l'admin, sinon il disparaît de la vue et ne sonne jamais chez la bonne
   * personne. Absent = son propre agenda.
   */
  ownerUserId: z.string().uuid().optional(),
});

/** Crée un rappel : il apparaîtra dans l'agenda et dans le cockpit du jour. */
export async function createReminderAction(input: z.infer<typeof reminderSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  await requireRole(user, ['admin', 'closer', 'closer_junior']);
  await ensureUserRecord(user);

  const { targetId, targetKind, dueAt, note, ownerUserId } = parsed.data;
  // Poser un rappel dans l'agenda d'un autre est réservé à l'admin — même
  // règle d'accès que resolveRdvAccess pour la consultation.
  const owner = ownerUserId ?? user.id;
  if (owner !== user.id && user.role !== 'admin') {
    return { success: false, error: 'Tu ne peux créer un rappel que dans ton propre agenda.' };
  }

  await db.insert(closerTasks).values({
    // Exactement une cible renseignée : la contrainte en base le vérifie aussi.
    investorId: targetKind === 'investor' ? targetId : null,
    rdvContactId: targetKind === 'contact' ? targetId : null,
    closerId: owner,
    type: 'callback',
    dueAt: new Date(dueAt),
    note: note ?? null,
    createdBy: user.id,
  });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'rdv.reminder_created',
    resourceType: targetKind === 'investor' ? 'investor' : 'rdv_contact',
    resourceId: targetId,
    metadata: { dueAt, closerId: owner },
  });

  revalidatePath('/rdv');
  revalidatePath('/closing/today');
  await notifyChange(SYNC_TOPICS.closing);
  return { success: true };
}

const completeSchema = z.object({
  reminderId: z.string().uuid(),
  /** Propriétaire de l'agenda affiché (vue admin) — voir createReminderAction. */
  ownerUserId: z.string().uuid().optional(),
});

/**
 * Marque un rappel comme fait. Seul son propriétaire peut le clore — ou un
 * admin depuis l'agenda de ce propriétaire, sinon le bouton « Fait » de la vue
 * admin échouerait systématiquement (les rappels affichés sont ceux du closer).
 */
export async function completeReminderAction(input: { reminderId: string; ownerUserId?: string }) {
  const user = await getAuthenticatedUser();
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Rappel introuvable.' };
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  const owner = parsed.data.ownerUserId ?? user.id;
  if (owner !== user.id && user.role !== 'admin') {
    return { success: false, error: 'Ce rappel ne t’appartient pas.' };
  }

  const done = await db
    .update(closerTasks)
    .set({ status: 'done', completedAt: new Date() })
    .where(
      and(
        eq(closerTasks.id, parsed.data.reminderId),
        eq(closerTasks.closerId, owner),
        eq(closerTasks.status, 'pending'),
      ),
    )
    .returning({ id: closerTasks.id });

  if (done.length === 0) return { success: false, error: 'Ce rappel ne t’appartient pas.' };

  // Trace : un admin qui clôt le rappel d'un autre closer, ça doit se voir.
  if (owner !== user.id) {
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'rdv.reminder_completed',
      resourceType: 'closer_task',
      resourceId: parsed.data.reminderId,
      metadata: { onBehalfOf: owner },
    });
  }

  revalidatePath('/rdv');
  revalidatePath('/closing/today');
  await notifyChange(SYNC_TOPICS.closing);
  return { success: true };
}
