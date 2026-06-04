'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { runSahSync, type SyncResult } from '@/lib/integrations/sah/sync';

export type SahSyncActionResult = { ok: true; result: SyncResult } | { ok: false; message: string };

export async function triggerSahSyncAction(): Promise<SahSyncActionResult> {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin']);

  try {
    const result = await runSahSync();
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'sah.sync',
      resourceType: 'sah',
      resourceId: 'manual',
      metadata: { ...result },
    });
    revalidatePath('/closing/pipeline');
    revalidatePath('/dashboard');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Échec de la synchronisation.' };
  }
}
