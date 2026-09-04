'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { NEXT_ACTION_LABELS, type NextActionKind } from '@/lib/closing/next-action';
import { recordCall } from '@/lib/db/queries/call-record';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

const NEXT_KINDS = Object.keys(NEXT_ACTION_LABELS) as [NextActionKind, ...NextActionKind[]];

const schema = z.object({
  investorId: z.string().uuid(),
  outcome: z.enum([
    'reached',
    'no_answer',
    'voicemail',
    'wrong_number',
    'profile_incompatible',
    'in_progress',
  ]),
  reachedResult: z.enum(['interested', 'will_finish_kyc', 'not_now', 'refused']).optional(),
  next: z.object({
    kind: z.enum(NEXT_KINDS),
    dueAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  note: z.string().trim().max(4000).optional(),
});

export type RecordCallActionInput = z.infer<typeof schema>;

export type RecordCallActionResult =
  | {
      ok: true;
      /** Où la personne vient d'être rangée, quand l'appel l'a déplacée. */
      moved: { stage: string; reason: string } | null;
      /** La suite posée, en clair — « Réessayer · sam. 05 sept. 10:00 ». */
      nextLabel: string | null;
    }
  | { ok: false; message: string };

/**
 * Enregistre un appel avec sa suite, en une fois (mode appel, fiche).
 * Auth → validation → permission → écriture (recordCall) → audit → revalidation.
 */
export async function recordCallAction(
  input: RecordCallActionInput,
): Promise<RecordCallActionResult> {
  let parsed: RecordCallActionInput;
  try {
    parsed = schema.parse(input);
  } catch {
    return { ok: false, message: 'Données invalides.' };
  }
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, ['admin', 'closer', 'closer_junior']);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }

  try {
    await ensureUserRecord(user);
    const res = await recordCall({
      userId: user.id,
      investorId: parsed.investorId,
      outcome: parsed.outcome,
      reachedResult: parsed.reachedResult ?? null,
      next: {
        kind: parsed.next.kind,
        dueAt: parsed.next.dueAt ? new Date(parsed.next.dueAt) : null,
        note: parsed.next.note ?? null,
      },
      note: parsed.note ?? null,
    });
    if (!res.ok) return res;

    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'closing.call_recorded',
      resourceType: 'investor',
      resourceId: parsed.investorId,
      metadata: {
        outcome: parsed.outcome,
        reachedResult: parsed.reachedResult ?? null,
        nextKind: parsed.next.kind,
        nextDueAt: parsed.next.dueAt ?? null,
        stageApplied: res.moved?.stage ?? null,
      },
    });

    for (const path of [
      `/closing/investor/${parsed.investorId}`,
      '/closing/aujourdhui',
      '/closing/clients',
      '/closing/resultats',
      '/closing/queue',
      '/closing/today',
      '/closing/pipeline',
      '/closing/mes-leads',
    ]) {
      revalidatePath(path);
    }
    // Les collègues doivent voir l'appel tout de suite : verrou levé, pool à jour.
    await notifyChange(SYNC_TOPICS.closing);

    const dueAt = parsed.next.dueAt ? new Date(parsed.next.dueAt) : res.proposal.dueAt;
    const nextLabel =
      parsed.next.kind === 'none' || !dueAt
        ? null
        : `${NEXT_ACTION_LABELS[parsed.next.kind]} · ${dueAt.toLocaleString('fr-FR', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris',
          })}`;
    return { ok: true, moved: res.moved, nextLabel };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'enregistrement." };
  }
}
