'use server';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import {
  contactIdForInvestor,
  progressStage,
  progressStageAfterCall,
} from '@/lib/db/queries/webinar-pipeline';
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

  // Un appel enregistré fait entrer la personne dans le tableau de suivi — ou
  // l'y fait avancer. Sans ça, l'appel n'existerait que dans l'historique et le
  // closer devrait recréer sa carte à la main.
  const contactId = parsed.contactId ?? (await contactIdForInvestor(parsed.investorId));
  if (contactId) await progressStageAfterCall(contactId, parsed.outcome);

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
  revalidatePath('/webinaires/suivi');
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
  revalidatePath('/webinaires/suivi');
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
 * « Je prends » : prise en charge d'un inscrit par un closer.
 *
 * Deux effets, indissociables : la fiche est verrouillée (deux closers
 * n'appellent pas la même personne) ET une carte apparaît dans le tableau de
 * suivi, colonne « Pris en charge ». Avant, le bouton ne faisait que poser un
 * propriétaire invisible à l'écran : cliquer semblait sans effet.
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

  const stage = await progressStage(parsed.contactId, 'taken');

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.contact_claimed',
    resourceType: 'rdv_contact',
    resourceId: parsed.contactId,
    metadata: { stage },
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  revalidatePath('/webinaires/suivi');
  return { success: true };
}

/** Libère la fiche pour un collègue. La carte de suivi, elle, reste où elle est. */
export async function releaseWebinarContact(input: z.infer<typeof claimSchema>) {
  const user = await getAuthenticatedUser();
  const parsed = claimSchema.parse(input);
  await requireRole(user, ['admin', 'closer', 'closer_junior']);

  // Un admin peut débloquer une fiche coincée sur un closer absent ; un closer
  // ne libère que la sienne.
  const scope =
    user.role === 'admin'
      ? eq(rdvContacts.id, parsed.contactId)
      : and(eq(rdvContacts.id, parsed.contactId), eq(rdvContacts.ownerUserId, user.id));

  const updated = await db
    .update(rdvContacts)
    .set({ ownerUserId: null, updatedAt: new Date() })
    .where(scope)
    .returning({ id: rdvContacts.id });

  if (updated.length === 0) {
    return { success: false, error: 'Cette fiche est suivie par un autre closer.' };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'webinar.contact_released',
    resourceType: 'rdv_contact',
    resourceId: parsed.contactId,
  });

  revalidatePath(`/webinaires/${parsed.webinarId}`);
  revalidatePath('/webinaires/suivi');
  return { success: true };
}
