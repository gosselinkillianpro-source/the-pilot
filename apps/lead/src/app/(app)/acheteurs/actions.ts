'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { AuthError, getAuthenticatedUser, requireRole } from '@/lib/auth';
import {
  type BuyerInput,
  buyerInputSchema,
  createBuyer,
  createPack,
  inviteBuyerUser,
  removeBuyerUser,
  setBuyerPause,
  updateBuyer,
} from '@/lib/buyers/service';

export type FormState = { error?: string; ok?: string; id?: string } | null;

function list(fd: FormData, name: string): string[] {
  return fd.getAll(name).map(String).filter(Boolean);
}
function num(fd: FormData, name: string): number | undefined {
  const v = String(fd.get(name) ?? '').trim();
  if (!v) return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
function euros(fd: FormData, name: string): number {
  const n = num(fd, name);
  return n === undefined ? 0 : Math.round(n * 100);
}

function parseBuyer(fd: FormData): { ok: true; data: BuyerInput } | { ok: false; error: string } {
  const exclusions: Record<string, string[]> = {};
  const exStatut = list(fd, 'exclusion_statut_pro');
  if (exStatut.length) exclusions.statut_pro = exStatut;
  const raw = {
    sourceId: String(fd.get('sourceId') ?? ''),
    name: String(fd.get('name') ?? ''),
    legalName: String(fd.get('legalName') ?? '') || null,
    oriasNumber: String(fd.get('oriasNumber') ?? ''),
    contactName: String(fd.get('contactName') ?? '') || null,
    contactEmail: String(fd.get('contactEmail') ?? ''),
    contactPhone: String(fd.get('contactPhone') ?? '') || null,
    criteria: {
      montant_min: String(fd.get('montant_min') ?? '') || undefined,
      objectifs: list(fd, 'objectifs'),
      timing_max: String(fd.get('timing_max') ?? '') || undefined,
      impot_min: String(fd.get('impot_min') ?? '') || undefined,
      patrimoine_min: String(fd.get('patrimoine_min') ?? '') || undefined,
      age: list(fd, 'age'),
      exclusions,
      obligatoires: list(fd, 'obligatoires'),
    },
    dailyCap: num(fd, 'dailyCap') ?? null,
    weeklyCap: num(fd, 'weeklyCap') ?? null,
    priority: num(fd, 'priority') ?? 1,
    pricePerRdvCents: euros(fd, 'pricePerRdv'),
    signedValueCents: num(fd, 'signedValue') !== undefined ? euros(fd, 'signedValue') : null,
    validationDelayHours: num(fd, 'validationDelayHours') ?? 48,
    tacitValidationEnabled: fd.get('tacitValidationEnabled') === 'on',
    calendarProvider: String(fd.get('calendarProvider') ?? 'manual'),
    bookingUrl: String(fd.get('bookingUrl') ?? '').trim(),
    durationMin: num(fd, 'durationMin') ?? 30,
    timezone: String(fd.get('timezone') ?? 'Europe/Paris'),
    active: fd.get('active') === 'on',
  };
  const parsed = buyerInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Champ « ${issue?.path.join('.') ?? '?'} » : ${issue?.message ?? 'invalide'}`,
    };
  }
  return { ok: true, data: parsed.data };
}

async function admin() {
  const user = await getAuthenticatedUser();
  await requireRole(user, ['admin']);
  return user;
}

export async function createBuyerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await admin();
    const parsed = parseBuyer(fd);
    if (!parsed.ok) return { error: parsed.error };
    const id = await createBuyer(user, parsed.data);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'buyer.create',
      objectType: 'buyer',
      objectId: id,
    });
    revalidatePath('/acheteurs');
    return { ok: 'Acheteur créé.', id };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function updateBuyerAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await admin();
    const parsed = parseBuyer(fd);
    if (!parsed.ok) return { error: parsed.error };
    await updateBuyer(user, z.string().uuid().parse(id), parsed.data);
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'buyer.update',
      objectType: 'buyer',
      objectId: id,
    });
    revalidatePath('/acheteurs');
    revalidatePath(`/acheteurs/${id}`);
    return { ok: 'Enregistré.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function inviteBuyerUserAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await admin();
    const email = z
      .string()
      .email()
      .parse(String(fd.get('email') ?? '').trim());
    const r = await inviteBuyerUser(user, { buyerId: z.string().uuid().parse(id), email });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'buyer.invite_user',
      objectType: 'buyer',
      objectId: id,
      metadata: { email },
    });
    revalidatePath(`/acheteurs/${id}`);
    return {
      ok: r.created
        ? `Accès créé pour ${email}. Il se connecte par lien magique sur /login/acheteur.`
        : `${email} avait déjà un compte : accès rattaché.`,
    };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function removeBuyerUserAction(id: string, email: string): Promise<FormState> {
  try {
    const user = await admin();
    await removeBuyerUser(user, z.string().uuid().parse(id), z.string().email().parse(email));
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'buyer.remove_user',
      objectType: 'buyer',
      objectId: id,
      metadata: { email },
    });
    revalidatePath(`/acheteurs/${id}`);
    return { ok: 'Accès retiré.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function createPackAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  try {
    const user = await admin();
    const size = z
      .number()
      .int()
      .min(1)
      .max(500)
      .parse(num(fd, 'size') ?? 10);
    const isPilot = fd.get('isPilot') === 'on';
    const packId = await createPack(user, {
      buyerId: z.string().uuid().parse(id),
      size,
      priceCentsPerRdv: euros(fd, 'pricePerRdv'),
      isPilot,
      prepaid: fd.get('prepaid') === 'on' || isPilot,
    });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'pack.create',
      objectType: 'pack',
      objectId: packId,
      metadata: { buyer_id: id, size, isPilot },
    });
    revalidatePath(`/acheteurs/${id}`);
    return { ok: `Pack de ${size} RDV créé.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}

export async function pauseBuyerAction(id: string, days: number): Promise<FormState> {
  try {
    const user = await admin();
    const until = days > 0 ? new Date(Date.now() + days * 86400000) : null;
    await setBuyerPause(user, z.string().uuid().parse(id), until);
    revalidatePath('/acheteurs');
    revalidatePath(`/acheteurs/${id}`);
    return { ok: until ? `En pause ${days} jour(s).` : 'Pause levée.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Accès refusé.' };
    return { error: e instanceof Error ? e.message : 'Erreur.' };
  }
}
