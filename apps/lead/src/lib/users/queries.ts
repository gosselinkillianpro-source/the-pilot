import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { users } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';

export async function listUsers(admin: AuthenticatedUser) {
  return withDbSession(scopeFor(admin), (tx) =>
    tx.select().from(users).orderBy(asc(users.role), asc(users.email)),
  );
}

export async function getUserRow(actor: AuthenticatedUser, id: string) {
  const rows = await withDbSession(scopeFor(actor), (tx) =>
    tx.select().from(users).where(eq(users.id, id)).limit(1),
  );
  return rows[0] ?? null;
}
