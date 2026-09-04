'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { AuthError, getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  rotateSourceSecret,
  type SourceInput,
  sourceInputSchema,
  updateSource,
} from '@/lib/sources/service';

export type FormState = { error?: string; ok?: string; secret?: string } | null;

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

function parse(fd: FormData): { ok: true; data: SourceInput } | { ok: false; error: string } {
  const serviceHours: Record<string, { open: string; close: string }> = {};
  for (const d of DAYS) {
    if (fd.get(`day_${d}_on`) === 'on') {
      serviceHours[d] = {
        open: String(fd.get(`day_${d}_open`) ?? '09:00'),
        close: String(fd.get(`day_${d}_close`) ?? '20:00'),
      };
    }
  }
  const raw = {
    name: String(fd.get('name') ?? ''),
    serviceHours,
    slaTargetMin: Number(fd.get('slaTargetMin') ?? 5),
    slaAlertMin: Number(fd.get('slaAlertMin') ?? 10),
    offHoursSms: String(fd.get('offHoursSms') ?? '').trim() || null,
    script: {
      presentation: String(fd.get('script_presentation') ?? ''),
      capacite: String(fd.get('script_capacite') ?? ''),
      creneau: String(fd.get('script_creneau') ?? ''),
      interdits: String(fd.get('script_interdits') ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    },
    active: fd.get('active') === 'on',
  };
  const parsed = sourceInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Champ « ${issue?.path.join('.') ?? '?'} » : ${issue?.message ?? 'invalide'}`,
    };
  }
  return { ok: true, data: parsed.data };
}

export async function updateSourceAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await getAuthenticatedUser();
    await requireRole(user, ['admin']);
    const parsed = parse(fd);
    if (!parsed.ok) return { error: parsed.error };
    await updateSource(user, z.string().uuid().parse(id), parsed.data);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'source.update',
      objectType: 'source',
      objectId: id,
    });
    revalidatePath('/sources');
    revalidatePath(`/sources/${id}`);
    return { ok: 'Réglages enregistrés.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function rotateSecretAction(id: string): Promise<FormState> {
  try {
    const user = await getAuthenticatedUser();
    await requireRole(user, ['admin']);
    const secret = await rotateSourceSecret(user, z.string().uuid().parse(id));
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'source.rotate_secret',
      objectType: 'source',
      objectId: id,
    });
    revalidatePath(`/sources/${id}`);
    return {
      ok: 'Nouveau secret généré. L’ancien ne fonctionne plus : mettez à jour la config du site.',
      secret,
    };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}
