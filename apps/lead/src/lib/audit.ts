import 'server-only';
import { headers } from 'next/headers';
import { auditLog } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';

export type AuditEntry = {
  userId: string | null;
  userEmail?: string;
  userRole?: string;
  action: string;
  objectType: string;
  objectId?: string | null;
  metadata?: Record<string, unknown>;
};

function firstIp(raw: string | null): string | null {
  const first = raw?.split(',')[0]?.trim();
  if (!first) return null;
  return /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}

/**
 * Journalise une action sensible (lecture / export / suppression de données
 * personnelles, décision admin). Best-effort : un échec ne casse jamais
 * l'action métier, il est remonté dans les logs serveur.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = firstIp(h.get('x-forwarded-for') ?? h.get('x-real-ip'));
    } catch {
      // Hors requête (job) : pas d'en-têtes.
    }
    await asSystem((tx) =>
      tx.insert(auditLog).values({
        userId: entry.userId,
        userEmail: entry.userEmail ?? null,
        userRole: entry.userRole ?? null,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId ?? null,
        metadata: entry.metadata ?? null,
        ip,
      }),
    );
  } catch (e) {
    console.error('[audit] échec de journalisation', e instanceof Error ? e.message : e);
  }
}
