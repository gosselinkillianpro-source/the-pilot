import 'server-only';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

export type AuditAction = {
  userId: string | null;
  userEmail?: string;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

/** Première IP de la chaîne x-forwarded-for, uniquement si elle ressemble à une IP
 *  (la colonne est de type `inet` : une valeur invalide ferait échouer l'insert). */
function firstValidIp(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  if (!first) return null;
  return /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}

/**
 * Journalise une action sensible dans la table `audit_log` (règle CLAUDE.md #11).
 * Best-effort : un échec d'insertion ne doit JAMAIS casser l'action métier
 * (on le remonte dans les logs serveur, sans relancer).
 */
export async function logAudit(entry: AuditAction): Promise<void> {
  try {
    const headerList = await headers();
    const ip = firstValidIp(headerList.get('x-forwarded-for') ?? headerList.get('x-real-ip'));
    const userAgent = headerList.get('user-agent') ?? null;

    await db.insert(auditLog).values({
      userId: entry.userId,
      userEmail: entry.userEmail ?? null,
      userRole: entry.userRole ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? null,
      ipAddress: ip,
      userAgent,
    });
  } catch (e) {
    console.error('logAudit failed:', e instanceof Error ? e.message : e);
  }
}
