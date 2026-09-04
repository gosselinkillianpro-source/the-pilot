'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { AuthError, getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  createStaffUser,
  prefsSchema,
  staffUserSchema,
  updateAlertPrefs,
  updateStaffScope,
} from '@/lib/users/service';

export type FormState = { error?: string; ok?: string } | null;

export async function createStaffUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await getAuthenticatedUser();
    await requireRole(user, ['admin']);
    const parsed = staffUserSchema.safeParse({
      email: String(fd.get('email') ?? ''),
      password: String(fd.get('password') ?? ''),
      name: String(fd.get('name') ?? '') || null,
      role: String(fd.get('role') ?? 'setter'),
      sourceIds: fd.getAll('sourceIds').map(String),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
    const id = await createStaffUser(user, parsed.data);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'user.create',
      objectType: 'user',
      objectId: id,
      metadata: { role: parsed.data.role },
    });
    revalidatePath('/utilisateurs');
    return { ok: `Compte ${parsed.data.role} créé pour ${parsed.data.email}.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function updatePrefsAction(
  targetUserId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await getAuthenticatedUser();
    const parsed = prefsSchema.safeParse({
      telegramChatId: String(fd.get('telegramChatId') ?? '').trim() || null,
      phoneForAlerts: String(fd.get('phoneForAlerts') ?? '').trim() || null,
      onDuty: fd.get('onDuty') === 'on',
    });
    if (!parsed.success) return { error: 'Données invalides.' };
    await updateAlertPrefs(user, z.string().uuid().parse(targetUserId), parsed.data);
    revalidatePath('/utilisateurs');
    revalidatePath('/utilisateurs/moi');
    revalidatePath(`/utilisateurs/${targetUserId}`);
    return { ok: 'Préférences enregistrées.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function updateScopeAction(
  targetUserId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await getAuthenticatedUser();
    await requireRole(user, ['admin']);
    const role = z.enum(['admin', 'setter']).parse(String(fd.get('role') ?? 'setter'));
    const sourceIds = z.array(z.string().uuid()).parse(fd.getAll('sourceIds').map(String));
    const active = fd.get('active') === 'on';
    await updateStaffScope(user, z.string().uuid().parse(targetUserId), {
      role,
      sourceIds,
      active,
    });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'user.update_scope',
      objectType: 'user',
      objectId: targetUserId,
      metadata: { role, sourceIds, active },
    });
    revalidatePath('/utilisateurs');
    revalidatePath(`/utilisateurs/${targetUserId}`);
    return { ok: 'Périmètre enregistré.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}
