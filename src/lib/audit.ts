import { headers } from 'next/headers';

export type AuditAction = {
  userId: string | null;
  userEmail?: string;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

export async function logAudit(entry: AuditAction): Promise<void> {
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for') ?? headerList.get('x-real-ip') ?? null;
  const userAgent = headerList.get('user-agent') ?? null;

  // TODO: insert into Postgres audit_log table via Drizzle
  // For now, structured console log so it ends up in Vercel logs
  console.log(
    JSON.stringify({
      kind: 'audit',
      at: new Date().toISOString(),
      ip,
      userAgent,
      ...entry,
    }),
  );
}
