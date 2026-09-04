import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { randomToken } from '@/lib/crypto/hash';
import { type CallScript, type ServiceHours, sources } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';

const hm = z.string().regex(/^\d{2}:\d{2}$/);

export const serviceHoursSchema = z.record(
  z.enum(['1', '2', '3', '4', '5', '6', '7']),
  z.object({ open: hm, close: hm }),
);

export const sourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  serviceHours: serviceHoursSchema,
  slaTargetMin: z.number().int().min(1).max(120),
  slaAlertMin: z.number().int().min(1).max(240),
  offHoursSms: z.string().trim().max(480).optional().nullable(),
  script: z.object({
    presentation: z.string().max(2000),
    capacite: z.string().max(2000),
    creneau: z.string().max(2000),
    interdits: z.array(z.string().max(200)),
  }),
  active: z.boolean(),
});

export type SourceInput = z.infer<typeof sourceInputSchema>;

export async function updateSource(
  admin: AuthenticatedUser,
  id: string,
  input: SourceInput,
): Promise<void> {
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx
      .update(sources)
      .set({
        name: input.name,
        serviceHours: input.serviceHours as ServiceHours,
        slaTargetMin: input.slaTargetMin,
        slaAlertMin: input.slaAlertMin,
        offHoursSms: input.offHoursSms ?? null,
        script: input.script as CallScript,
        active: input.active,
      })
      .where(eq(sources.id, id));
  });
}

/** Nouveau secret de webhook : l'ancien cesse immédiatement de fonctionner. Affiché une seule fois. */
export async function rotateSourceSecret(admin: AuthenticatedUser, id: string): Promise<string> {
  const secret = randomToken(24);
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx.update(sources).set({ webhookSecret: secret }).where(eq(sources.id, id));
  });
  return secret;
}
