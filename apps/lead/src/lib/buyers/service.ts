import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { type BuyerCriteria, buyers, buyerUsers, packs, users } from '@/lib/db/schema';
import { asSystem, withDbSession } from '@/lib/db/session';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/** Gestion des acheteurs (admin) : fiche, critères, invitation au portail, pack pilote. */
export const criteriaSchema = z.object({
  montant_min: z.string().optional(),
  objectifs: z.array(z.string()).optional(),
  timing_max: z.string().optional(),
  impot_min: z.string().optional(),
  patrimoine_min: z.string().optional(),
  age: z.array(z.string()).optional(),
  zones: z.array(z.string()).optional(),
  exclusions: z.record(z.string(), z.array(z.string())).optional(),
  obligatoires: z.array(z.string()).default([]),
});

export const buyerInputSchema = z.object({
  sourceId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(200).optional().nullable(),
  oriasNumber: z.string().trim().min(1).max(40),
  contactName: z.string().trim().max(120).optional().nullable(),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  criteria: criteriaSchema,
  dailyCap: z.number().int().positive().optional().nullable(),
  weeklyCap: z.number().int().positive().optional().nullable(),
  priority: z.number().int().min(1).max(99).default(1),
  pricePerRdvCents: z.number().int().min(0).default(0),
  signedValueCents: z.number().int().min(0).optional().nullable(),
  validationDelayHours: z.number().int().min(1).max(240).default(48),
  tacitValidationEnabled: z.boolean().default(false),
  calendarProvider: z
    .enum(['calendly_oauth', 'calendly_link', 'calcom', 'google', 'manual'])
    .default('manual'),
  bookingUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
  durationMin: z.number().int().min(10).max(180).default(30),
  timezone: z.string().default('Europe/Paris'),
  active: z.boolean().default(true),
});

export type BuyerInput = z.infer<typeof buyerInputSchema>;

function toRow(input: BuyerInput) {
  return {
    sourceId: input.sourceId,
    name: input.name,
    legalName: input.legalName ?? null,
    oriasNumber: input.oriasNumber,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone ?? null,
    criteria: input.criteria as BuyerCriteria,
    dailyCap: input.dailyCap ?? null,
    weeklyCap: input.weeklyCap ?? null,
    priority: input.priority,
    pricePerRdvCents: input.pricePerRdvCents,
    signedValueCents: input.signedValueCents ?? null,
    validationDelayHours: input.validationDelayHours,
    tacitValidationEnabled: input.tacitValidationEnabled,
    calendarProvider: input.calendarProvider,
    calendarConfig: { booking_url: input.bookingUrl || undefined, duration_min: input.durationMin },
    timezone: input.timezone,
    active: input.active,
  };
}

export async function createBuyer(admin: AuthenticatedUser, input: BuyerInput): Promise<string> {
  return withDbSession(scopeFor(admin), async (tx) => {
    const rows = await tx.insert(buyers).values(toRow(input)).returning({ id: buyers.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('acheteur sans identifiant');
    return id;
  });
}

export async function updateBuyer(
  admin: AuthenticatedUser,
  id: string,
  input: BuyerInput,
): Promise<void> {
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx.update(buyers).set(toRow(input)).where(eq(buyers.id, id));
  });
}

export async function setBuyerPause(
  admin: AuthenticatedUser,
  id: string,
  until: Date | null,
): Promise<void> {
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx.update(buyers).set({ pausedUntil: until }).where(eq(buyers.id, id));
  });
}

/** Crée un pack (pilote offert ou prépayé) ; il devient le pack actif décrémenté à chaque RDV facturable. */
export async function createPack(
  admin: AuthenticatedUser,
  input: {
    buyerId: string;
    size: number;
    priceCentsPerRdv: number;
    isPilot: boolean;
    prepaid: boolean;
  },
): Promise<string> {
  return withDbSession(scopeFor(admin), async (tx) => {
    const rows = await tx
      .insert(packs)
      .values({
        buyerId: input.buyerId,
        size: input.size,
        priceCentsPerRdv: input.isPilot ? 0 : input.priceCentsPerRdv,
        totalCents: input.isPilot ? 0 : input.priceCentsPerRdv * input.size,
        prepaid: input.prepaid,
        remaining: input.size,
        isPilot: input.isPilot,
        paidAt: input.isPilot ? new Date() : null,
      })
      .returning({ id: packs.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('pack sans identifiant');
    return id;
  });
}

/**
 * Invite un utilisateur acheteur : compte Supabase Auth (app=lead, role=buyer,
 * buyer_id), ligne lead.users, ligne buyer_users. Il se connectera par lien
 * magique (shouldCreateUser=false : aucune inscription libre).
 */
export async function inviteBuyerUser(
  admin: AuthenticatedUser,
  input: { buyerId: string; email: string; role?: 'owner' | 'member' },
): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const supabase = getSupabaseAdminClient();
  let userId: string | null = null;
  let created = false;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { app: 'lead', role: 'buyer', buyer_id: input.buyerId },
  });
  if (error) {
    // Déjà un compte (invité deux fois, ou compte lead.users existant) : on le retrouve chez nous.
    const existing = await asSystem((tx) =>
      tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
    );
    if (!existing[0]) throw new Error(`Supabase : ${error.message}`);
    userId = existing[0].id;
  } else {
    userId = data.user.id;
    created = true;
  }
  const uid = userId;
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx
      .insert(users)
      .values({ id: uid, email, role: 'buyer', buyerId: input.buyerId, active: true })
      .onConflictDoUpdate({
        target: users.id,
        set: { role: 'buyer', buyerId: input.buyerId, active: true },
      });
    await tx
      .insert(buyerUsers)
      .values({ buyerId: input.buyerId, userId: uid, email, role: input.role ?? 'owner' })
      .onConflictDoNothing({ target: [buyerUsers.buyerId, buyerUsers.email] });
  });
  return { userId: uid, created };
}

export async function removeBuyerUser(
  admin: AuthenticatedUser,
  buyerId: string,
  email: string,
): Promise<void> {
  await withDbSession(scopeFor(admin), async (tx) => {
    await tx
      .delete(buyerUsers)
      .where(and(eq(buyerUsers.buyerId, buyerId), eq(buyerUsers.email, email)));
    await tx
      .update(users)
      .set({ active: false })
      .where(and(eq(users.email, email), eq(users.role, 'buyer')));
  });
}
