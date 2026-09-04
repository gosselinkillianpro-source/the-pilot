import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { users } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const staffUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10).max(200),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.enum(['admin', 'setter']),
  sourceIds: z.array(z.string().uuid()).default([]),
});

export type StaffUserInput = z.infer<typeof staffUserSchema>;

/** Compte interne (admin ou setter) : Supabase Auth + lead.users. */
export async function createStaffUser(
  admin: AuthenticatedUser,
  input: StaffUserInput,
): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    app_metadata: { app: 'lead', role: input.role },
    user_metadata: { name: input.name ?? '' },
  });
  if (error) throw new Error(`Supabase : ${error.message}`);
  const id = data.user.id;
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx
      .insert(users)
      .values({
        id,
        email: input.email.trim().toLowerCase(),
        name: input.name ?? null,
        role: input.role,
        sourceIds: input.sourceIds,
        onDuty: false,
        active: true,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          role: input.role,
          sourceIds: input.sourceIds,
          name: input.name ?? null,
          active: true,
        },
      });
  });
  return id;
}

export const prefsSchema = z.object({
  telegramChatId: z.string().trim().max(40).optional().nullable(),
  phoneForAlerts: z.string().trim().max(40).optional().nullable(),
  onDuty: z.boolean(),
});

/** Chacun règle ses alertes ; un admin peut le faire pour n'importe qui. */
export async function updateAlertPrefs(
  actor: AuthenticatedUser,
  targetUserId: string,
  input: z.infer<typeof prefsSchema>,
): Promise<void> {
  if (actor.role !== 'admin' && actor.id !== targetUserId) throw new Error('FORBIDDEN');
  await withDbSession(scopeFor(actor), async (tx) => {
    await tx
      .update(users)
      .set({
        telegramChatId: input.telegramChatId || null,
        phoneForAlerts: input.phoneForAlerts || null,
        onDuty: input.onDuty,
      })
      .where(eq(users.id, targetUserId));
  });
}

export async function updateStaffScope(
  admin: AuthenticatedUser,
  targetUserId: string,
  input: { role: 'admin' | 'setter'; sourceIds: string[]; active: boolean },
): Promise<void> {
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx
      .update(users)
      .set({ role: input.role, sourceIds: input.sourceIds, active: input.active })
      .where(eq(users.id, targetUserId));
  });
  const supabase = getSupabaseAdminClient();
  await supabase.auth.admin.updateUserById(targetUserId, {
    app_metadata: { app: 'lead', role: input.role },
  });
}
