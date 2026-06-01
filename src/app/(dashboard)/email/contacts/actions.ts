'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  createBrevoList,
  removeContactsFromList,
  updateBrevoContact,
  upsertBrevoContact,
} from '@/lib/integrations/brevo/send';

const WRITERS = ['admin', 'closer', 'closer_junior'] as const;

export type ContactActionResult = { ok: true } | { ok: false; message: string };

const createSchema = z.object({
  email: z.string().email('Email invalide.'),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  listIds: z.array(z.number()).optional(),
});

export async function createContactAction(
  input: z.infer<typeof createSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const { email, firstName, lastName, listIds } = parsed.data;
  const attributes: Record<string, unknown> = {};
  if (firstName) attributes.PRENOM = firstName;
  if (lastName) attributes.NOM = lastName;

  try {
    await upsertBrevoContact({ email, attributes, listIds });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'contact.create',
      resourceType: 'contact',
      resourceId: email,
    });
    revalidatePath('/email/contacts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Échec de l'enregistrement." };
  }
}

const listMembershipSchema = z.object({
  email: z.string().email(),
  listId: z.number(),
});

export async function addToListAction(
  input: z.infer<typeof listMembershipSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);
  const parsed = listMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données invalides.' };

  try {
    await updateBrevoContact(parsed.data.email, { listIds: [parsed.data.listId] });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'contact.add_to_list',
      resourceType: 'contact',
      resourceId: parsed.data.email,
      metadata: { listId: parsed.data.listId },
    });
    revalidatePath('/email/contacts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec.' };
  }
}

export async function removeFromListAction(
  input: z.infer<typeof listMembershipSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);
  const parsed = listMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données invalides.' };

  try {
    await removeContactsFromList(parsed.data.listId, [parsed.data.email]);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'contact.remove_from_list',
      resourceType: 'contact',
      resourceId: parsed.data.email,
      metadata: { listId: parsed.data.listId },
    });
    revalidatePath('/email/contacts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec.' };
  }
}

const createListSchema = z.object({ name: z.string().min(1, 'Nom requis.').max(120) });

export async function createListAction(
  input: z.infer<typeof createListSchema>,
): Promise<ContactActionResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, [...WRITERS]);
  const parsed = createListSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Nom invalide.' };
  }

  try {
    await createBrevoList(parsed.data.name);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'list.create',
      resourceType: 'list',
      resourceId: parsed.data.name,
    });
    revalidatePath('/email/contacts');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec.' };
  }
}
