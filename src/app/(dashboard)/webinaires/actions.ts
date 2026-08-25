'use server';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { closerTasks, interactions, rdvContacts } from '@/lib/db/schema';

/**
 * Suivi des inscrits d'un webinaire.
 *
 * Ces actions marchent indifféremment sur un investisseur SAH ou sur un simple
 * prospect : `interactions` et `closer_tasks` acceptent l'un OU l'autre depuis
 * l'élargissement du schéma, avec une contrainte qui garantit qu'exactement une
 * cible est renseignée.
 */

/** Cible d'une action : une fiche investisseur SAH, ou une fiche prospect. */
const target = z
  .object({
    investorId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
  })
  .refine((t) => Boolean(t.investorId) !== Boolean(t.contactId), {
    message: 'Exactement une cible doit être fournie (investisseur OU contact).',
  });

/** Traduit la cible en colonnes, en respectant la contrainte d'exclusivité. */
function targetColumns(t: { investorId?: string | null; contactId?: string | null }) {
  return t.investorId
    ? { investorId: t.investorId, rdvContactId: null }
    : { investorId: null, rdvContactId: t.contactId ?? null };
}

const CALL_OUTCOMES = [
  'reached',
  'no_answer',
  'voicemail',
  'wrong_number',
  'callback_scheduled',
  'profile_incompatible',
  'in_progress',
] as const;

const logCallSchema = target.and(
  z.object({
    webinarId: z.string().uuid(),
    outcome: z.enum(CALL_OUTCOMES),
    note: z.string().trim().max(2000).optional(),
  }),
);

/** Enregistre un appel passé à un inscrit. */
export async function logWebinarCall(input: z.infer<typeof logCallSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = logCallSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);
  await ensureUserRecord(user);

  await db.insert(interactions).values({
    ...targetColumns(parsed),
    type: 'call_outbound',
    outcome: parsed.outcome,
    note: parsed.note ?? null,
    userId: user.id,
  });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.call_logged',
    resourceType: 'webinar_registration',
    resourceId: parsed.webinarId,
    metadata: { outcome: parsed.outcome, cible: parsed.investorId ?? parsed.contactId },
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  return { success: true };
}

const scheduleSchema = target.and(
  z.object({
    webinarId: z.string().uuid(),
    dueAt: z.string().datetime(),
    note: z.string().trim().max(500).optional(),
  }),
);

/** Programme un rappel — il apparaîtra dans le cockpit « Aujourd'hui » du closer. */
export async function scheduleWebinarCallback(input: z.infer<typeof scheduleSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = scheduleSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);
  await ensureUserRecord(user);

  await db.insert(closerTasks).values({
    ...targetColumns(parsed),
    closerId: user.id,
    type: 'callback',
    dueAt: new Date(parsed.dueAt),
    note: parsed.note ?? null,
    createdBy: user.id,
  });

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.callback_scheduled',
    resourceType: 'webinar_registration',
    resourceId: parsed.webinarId,
    metadata: { dueAt: parsed.dueAt },
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  return { success: true };
}

const noteSchema = z.object({
  webinarId: z.string().uuid(),
  contactId: z.string().uuid(),
  notes: z.string().trim().max(4000),
});

/** Note libre sur la fiche prospect (visible par toute l'équipe). */
export async function saveContactNote(input: z.infer<typeof noteSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = noteSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  await db
    .update(rdvContacts)
    .set({ notes: parsed.notes, updatedAt: new Date() })
    .where(eq(rdvContacts.id, parsed.contactId));

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.note_saved',
    resourceType: 'rdv_contact',
    resourceId: parsed.contactId,
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  return { success: true };
}

const claimSchema = z.object({
  webinarId: z.string().uuid(),
  contactId: z.string().uuid(),
});

/**
 * Prise en charge d'un prospect par un closer.
 * Un inscrit au webinaire n'appartient à personne au départ : c'est ce bouton
 * qui évite que deux closers appellent la même personne.
 */
export async function claimWebinarContact(input: z.infer<typeof claimSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = claimSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);
  await ensureUserRecord(user);

  // On ne prend que ce qui est libre : pas de vol de fiche entre closers.
  const updated = await db
    .update(rdvContacts)
    .set({ ownerUserId: user.id, updatedAt: new Date() })
    .where(
      and(
        eq(rdvContacts.id, parsed.contactId),
        // Libre, ou déjà à moi : on ne vole jamais la fiche d'un collègue.
        or(isNull(rdvContacts.ownerUserId), eq(rdvContacts.ownerUserId, user.id)),
      ),
    )
    .returning({ id: rdvContacts.id });

  if (updated.length === 0) {
    return { success: false, error: 'Cette personne est déjà suivie par un autre closer.' };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.contact_claimed',
    resourceType: 'rdv_contact',
    resourceId: parsed.contactId,
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  return { success: true };
}
