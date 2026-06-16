'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { runSahSync } from '@/lib/integrations/sah/sync';

// Garde anti-chevauchement (par instance serveur) : évite deux synchros simultanées.
let running = false;

/**
 * Synchronisation SAH COMPLÈTE à la demande (bouton « Sync » de la barre du haut).
 * Rafraîchit projets + investisseurs + souscriptions (upsert complet), sans attendre
 * le cron automatique. Réservé aux rôles internes. Idempotent, best-effort.
 */
export async function syncNowAction() {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin', 'closer', 'executive']);

  if (running) {
    return { ok: false as const, message: 'Une synchronisation est déjà en cours.' };
  }
  running = true;
  try {
    const result = await runSahSync('full');
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'sah.sync.manual',
      resourceType: 'system',
      resourceId: 'sah-sync',
      metadata: result,
    });
    // Rafraîchit toutes les pages du dashboard (les données ont potentiellement changé partout).
    revalidatePath('/', 'layout');
    return {
      ok: true as const,
      projects: result.projects,
      investors: result.investors,
      subscriptions: result.subscriptions,
      errors: result.errors,
    };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : 'Échec de la synchronisation.',
    };
  } finally {
    running = false;
  }
}
