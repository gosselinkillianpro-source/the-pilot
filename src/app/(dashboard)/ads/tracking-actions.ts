'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  deleteAdAttribution,
  insertAdAttribution,
  searchTrackCandidates,
  type TrackCandidate,
} from '@/lib/db/queries/ad-attributions';

/**
 * Actions du tracking pub manuel (page Ads) : rechercher une fiche, la
 * rattacher aux ads BREACH ou à une campagne, retirer une attribution.
 * Réservé admin / gérant — ce sont eux qui pilotent le budget pub.
 */

const ALLOWED_ROLES = ['admin', 'executive'] as const;

export type TrackActionResult = { ok: true } | { ok: false; message: string };
export type TrackSearchResult =
  | { ok: true; candidates: TrackCandidate[] }
  | { ok: false; message: string };

const searchSchema = z.object({ query: z.string().trim().min(2).max(120) });

export async function searchTrackedCandidatesAction(input: {
  query: string;
}): Promise<TrackSearchResult> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, [...ALLOWED_ROLES]);
  } catch {
    return { ok: false, message: 'Réservé à l’admin et au gérant.' };
  }
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Tape au moins 2 caractères.' };

  const candidates = await searchTrackCandidates(parsed.data.query);
  return { ok: true, candidates };
}

const addSchema = z.object({
  investorId: z.string().uuid(),
  label: z.string().trim().min(2).max(80),
  platform: z.enum(['Meta', 'Google']).nullable(),
});

export async function addTrackedPersonAction(input: {
  investorId: string;
  label: string;
  platform: 'Meta' | 'Google' | null;
}): Promise<TrackActionResult> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, [...ALLOWED_ROLES]);
  } catch {
    return { ok: false, message: 'Réservé à l’admin et au gérant.' };
  }
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Champs invalides (label 2–80 caractères).' };

  const added = await insertAdAttribution({
    investorId: parsed.data.investorId,
    label: parsed.data.label,
    platform: parsed.data.platform,
    createdBy: user.id,
  });
  if (!added) return { ok: false, message: 'Cette personne est déjà trackée.' };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'ads.attribution_add',
    resourceType: 'investor',
    resourceId: parsed.data.investorId,
    metadata: { label: parsed.data.label, platform: parsed.data.platform },
  });
  revalidatePath('/ads');
  return { ok: true };
}

const removeSchema = z.object({ id: z.string().uuid() });

export async function removeTrackedPersonAction(input: { id: string }): Promise<TrackActionResult> {
  const user = await getAuthenticatedUser();
  try {
    await requireRole(user, [...ALLOWED_ROLES]);
  } catch {
    return { ok: false, message: 'Réservé à l’admin et au gérant.' };
  }
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Identifiant invalide.' };

  const investorId = await deleteAdAttribution(parsed.data.id);
  if (!investorId) return { ok: false, message: 'Attribution introuvable (déjà retirée ?).' };

  await logAudit({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'ads.attribution_remove',
    resourceType: 'investor',
    resourceId: investorId,
    metadata: { attributionId: parsed.data.id },
  });
  revalidatePath('/ads');
  return { ok: true };
}
