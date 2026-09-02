'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { deleteFixedCost, insertFixedCost } from '@/lib/db/queries/ad-fixed-costs';

/** Saisie des coûts fixes marketing (console Ads). Admin / gérant uniquement. */

const ALLOWED_ROLES = ['admin', 'executive'] as const;

export type CostActionResult = { ok: true } | { ok: false; message: string };

const addSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mois au format YYYY-MM'),
  label: z.string().trim().min(2).max(120),
  amountEur: z.number().positive().max(1_000_000),
});

export async function addFixedCostAction(input: {
  month: string;
  label: string;
  amountEur: number;
}): Promise<CostActionResult> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, [...ALLOWED_ROLES]);
  } catch {
    return { ok: false, message: 'Réservé à l’admin et au gérant.' };
  }
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Champs invalides (mois YYYY-MM, montant > 0).' };
  }

  await insertFixedCost({ ...parsed.data, createdBy: user.id });
  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'ads.fixed_cost_add',
    resourceType: 'analytics',
    resourceId: 'ads',
    metadata: parsed.data,
  });
  revalidatePath('/ads');
  return { ok: true };
}

const removeSchema = z.object({ id: z.string().uuid() });

export async function removeFixedCostAction(input: { id: string }): Promise<CostActionResult> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, [...ALLOWED_ROLES]);
  } catch {
    return { ok: false, message: 'Réservé à l’admin et au gérant.' };
  }
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Identifiant invalide.' };

  const removed = await deleteFixedCost(parsed.data.id);
  if (!removed) return { ok: false, message: 'Ligne introuvable (déjà supprimée ?).' };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'ads.fixed_cost_remove',
    resourceType: 'analytics',
    resourceId: 'ads',
    metadata: { costId: parsed.data.id },
  });
  revalidatePath('/ads');
  return { ok: true };
}
