'use server';

import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserRecord } from '@/lib/db/queries/users';
import { progressStageAfterCall } from '@/lib/db/queries/webinar-pipeline';
import { closerTasks, interactions, investors, rdvContacts } from '@/lib/db/schema';
import { notifyChange } from '@/lib/realtime/broadcast';
import { SYNC_TOPICS } from '@/lib/realtime/topics';

/**
 * Actions de la fiche PROSPECT d'un RDV Calendly (personne pas encore inscrite
 * SAH) : enregistrer un appel, mettre à jour les infos, relier à une fiche
 * investisseur quand la personne s'inscrit sous un autre e-mail.
 */

const CLOSER_ROLES = ['admin', 'closer', 'closer_junior'] as const;

export type ContactActionResult = { ok: true } | { ok: false; message: string };

const CALL_OUTCOMES = [
  'reached',
  'no_answer',
  'voicemail',
  'wrong_number',
  'callback_scheduled',
  'profile_incompatible',
  'in_progress',
] as const;

const logCallSchema = z.object({
  contactId: z.string().uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(2000).optional(),
  callbackAt: z.string().datetime({ offset: true }).optional(),
});

/** Enregistre un appel sur la fiche prospect (+ rappel optionnel + avancement de la carte). */
export async function logContactCallAction(
  input: z.infer<typeof logCallSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  const parsed = logCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données invalides.' };
  try {
    await requireRole(user, [...CLOSER_ROLES]);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }
  await ensureUserRecord(user);

  await db.insert(interactions).values({
    investorId: null,
    rdvContactId: parsed.data.contactId,
    type: 'call_outbound',
    outcome: parsed.data.outcome,
    note: parsed.data.note ?? null,
    userId: user.id,
  });

  if (parsed.data.callbackAt) {
    await db.insert(closerTasks).values({
      investorId: null,
      rdvContactId: parsed.data.contactId,
      closerId: user.id,
      type: 'callback',
      dueAt: new Date(parsed.data.callbackAt),
      note: parsed.data.note ?? null,
      createdBy: user.id,
    });
  }

  // Même règle que le suivi : l'appel fait avancer (ou clore) la carte kanban.
  await progressStageAfterCall(parsed.data.contactId, parsed.data.outcome);

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'rdv.contact_call_logged',
    resourceType: 'rdv_contact',
    resourceId: parsed.data.contactId,
    metadata: { outcome: parsed.data.outcome, callbackAt: parsed.data.callbackAt ?? null },
  });

  revalidatePath(`/rdv/contact/${parsed.data.contactId}`);
  revalidatePath('/rdv');
  await notifyChange(SYNC_TOPICS.closing);
  return { ok: true };
}

const infoSchema = z.object({
  contactId: z.string().uuid(),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/** Met à jour téléphone et/ou bloc-notes de la fiche. */
export async function saveContactInfoAction(
  input: z.infer<typeof infoSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  const parsed = infoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données invalides.' };
  try {
    await requireRole(user, [...CLOSER_ROLES]);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }
  await ensureUserRecord(user);

  const changes: Partial<{ phone: string | null; notes: string | null }> = {};
  if (parsed.data.phone !== undefined) changes.phone = parsed.data.phone || null;
  if (parsed.data.notes !== undefined) changes.notes = parsed.data.notes || null;
  if (Object.keys(changes).length === 0) return { ok: true };

  await db
    .update(rdvContacts)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(rdvContacts.id, parsed.data.contactId));

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'rdv.contact_info_updated',
    resourceType: 'rdv_contact',
    resourceId: parsed.data.contactId,
    metadata: { fields: Object.keys(changes) },
  });

  revalidatePath(`/rdv/contact/${parsed.data.contactId}`);
  return { ok: true };
}

const searchSchema = z.object({ query: z.string().trim().min(2).max(120) });

export type LinkCandidate = { investorId: string; fullName: string | null; email: string };
export type LinkSearchResult =
  | { ok: true; candidates: LinkCandidate[] }
  | { ok: false; message: string };

/** Cherche la fiche SAH à relier (la personne s'est inscrite avec un autre e-mail). */
export async function searchInvestorsToLinkAction(input: {
  query: string;
}): Promise<LinkSearchResult> {
  const user = await getAuthenticatedUser();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Tape au moins 2 caractères.' };
  try {
    await requireRole(user, [...CLOSER_ROLES]);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }

  const q = `%${parsed.data.query}%`;
  const rows = await db
    .select({ investorId: investors.id, fullName: investors.fullName, email: investors.email })
    .from(investors)
    .where(
      and(isNull(investors.deletedAt), or(ilike(investors.fullName, q), ilike(investors.email, q))),
    )
    .limit(8);
  return { ok: true, candidates: rows };
}

const linkSchema = z.object({ contactId: z.string().uuid(), investorId: z.string().uuid() });

/** Relie la fiche prospect à une fiche investisseur SAH (rapprochement manuel). */
export async function linkContactToInvestorAction(
  input: z.infer<typeof linkSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données invalides.' };
  try {
    await requireRole(user, [...CLOSER_ROLES]);
  } catch {
    return { ok: false, message: 'Action réservée aux closers.' };
  }
  await ensureUserRecord(user);

  const updated = await db
    .update(rdvContacts)
    .set({ investorId: parsed.data.investorId, linkedBy: user.id, linkedAt: sql`now()` })
    .where(and(eq(rdvContacts.id, parsed.data.contactId), isNull(rdvContacts.investorId)))
    .returning({ id: rdvContacts.id });
  if (updated.length === 0) {
    return { ok: false, message: 'Fiche introuvable ou déjà reliée à un compte SAH.' };
  }

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'rdv.contact_linked',
    resourceType: 'rdv_contact',
    resourceId: parsed.data.contactId,
    metadata: { investorId: parsed.data.investorId },
  });

  revalidatePath(`/rdv/contact/${parsed.data.contactId}`);
  revalidatePath('/rdv');
  await notifyChange(SYNC_TOPICS.closing);
  return { ok: true };
}
