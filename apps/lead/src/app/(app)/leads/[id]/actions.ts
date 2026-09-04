'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { bookAppointment } from '@/lib/appointments/book';
import { logAudit } from '@/lib/audit';
import { AuthError, getAuthenticatedUser } from '@/lib/auth';
import { zonedTimeToUtc } from '@/lib/domain/time';
import {
  callbackLater,
  LeadActionError,
  markOutOfTarget,
  markUnreachable,
  nurtureLead,
  reopenLead,
  saveCriteria,
  saveNotes,
  startCall,
} from '@/lib/leads/qualification';

export type ActionResult =
  | { ok: true; message?: string; state?: string; data?: unknown }
  | { ok: false; error: string };

const uuid = z.string().uuid();

/** « 2026-09-04T14:30 » saisi par le setter = heure de Paris, jamais l'heure du navigateur. */
function parisLocalToDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return zonedTimeToUtc({
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  });
}

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Session expirée : reconnectez-vous.' };
    if (e instanceof LeadActionError) return { ok: false, error: e.message };
    console.error('[lead.action]', e);
    return { ok: false, error: 'Erreur inattendue. Réessayez.' };
  }
}

function refresh(leadId: string): void {
  for (const p of ['/', '/a-rappeler', '/leads', `/leads/${leadId}`, '/rendez-vous'])
    revalidatePath(p);
}

export async function startCallAction(leadId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const r = await startCall(user, uuid.parse(leadId));
    refresh(leadId);
    return {
      ok: true,
      state: r.state,
      message:
        r.slaMinutesEffective !== null
          ? `Délai de rappel : ${r.slaMinutesEffective} min`
          : undefined,
    };
  });
}

export async function unreachableAction(
  leadId: string,
  outcome: 'messagerie' | 'occupe',
): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const r = await markUnreachable(
      user,
      uuid.parse(leadId),
      z.enum(['messagerie', 'occupe']).parse(outcome),
    );
    refresh(leadId);
    const msg =
      r.plan.outcome === 'retry'
        ? `Relance programmée (tentative ${r.plan.attemptsCount + 1}).`
        : 'Lead passé injoignable.';
    return { ok: true, state: r.state, message: msg };
  });
}

export async function callbackLaterAction(
  leadId: string,
  localDateTime: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const at = parisLocalToDate(localDateTime);
    if (!at) return { ok: false, error: 'Date et heure obligatoires.' };
    const r = await callbackLater(user, uuid.parse(leadId), at);
    refresh(leadId);
    return { ok: true, state: r.state, message: 'Rappel programmé.' };
  });
}

export async function nurtureAction(leadId: string, reason: string): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const r = await nurtureLead(
      user,
      uuid.parse(leadId),
      z.enum(['curiosite', 'montant_sous_seuil', 'pas_maintenant']).parse(reason),
    );
    refresh(leadId);
    return { ok: true, state: r.state, message: 'Lead mis à nourrir.' };
  });
}

export async function outOfTargetAction(
  leadId: string,
  reason: string,
  note: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const parsedReason = z
      .enum([
        'doublon',
        'faux_numero',
        'montant_hors_criteres',
        'timing_hors_criteres',
        'hors_zone',
        'deja_client',
        'pas_interesse',
        'autre',
      ])
      .parse(reason);
    const r = await markOutOfTarget(
      user,
      uuid.parse(leadId),
      parsedReason,
      note.trim() || undefined,
    );
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'lead.out_of_target',
      objectType: 'lead',
      objectId: leadId,
      metadata: { reason: parsedReason },
    });
    refresh(leadId);
    return { ok: true, state: r.state, message: 'Lead classé hors cible.' };
  });
}

const bookSchema = z.object({
  buyerId: z.string().uuid(),
  scheduledLocal: z.string().min(16),
  durationMin: z.number().int().min(10).max(180).optional(),
  setterNotes: z.string().max(4000).optional(),
  routingReason: z.string().max(500).optional(),
});

export async function bookAction(
  leadId: string,
  input: z.infer<typeof bookSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const parsed = bookSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Acheteur et date obligatoires.' };
    const scheduledAt = parisLocalToDate(parsed.data.scheduledLocal);
    if (!scheduledAt) return { ok: false, error: 'Date du rendez-vous invalide.' };
    const r = await bookAppointment(user, {
      leadId: uuid.parse(leadId),
      buyerId: parsed.data.buyerId,
      scheduledAt,
      durationMin: parsed.data.durationMin,
      setterNotes: parsed.data.setterNotes?.trim() || undefined,
      routingReason: parsed.data.routingReason?.trim() || undefined,
    });
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'appointment.book',
      objectType: 'appointment',
      objectId: r.appointmentId,
      metadata: { lead_id: leadId, buyer_id: parsed.data.buyerId },
    });
    refresh(leadId);
    return {
      ok: true,
      state: r.state,
      message: `Rendez-vous posé avec ${r.buyerName}. Confirmations en cours d’envoi.`,
    };
  });
}

export async function saveNotesAction(leadId: string, notes: string): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    await saveNotes(user, uuid.parse(leadId), z.string().max(8000).parse(notes));
    refresh(leadId);
    return { ok: true, message: 'Notes enregistrées.' };
  });
}

export async function saveCriteriaAction(
  leadId: string,
  checks: Record<string, boolean | null>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const parsed = z.record(z.string().max(40), z.boolean().nullable()).parse(checks);
    const r = await saveCriteria(user, uuid.parse(leadId), parsed);
    refresh(leadId);
    return { ok: true, data: r };
  });
}

export async function reopenAction(leadId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await getAuthenticatedUser();
    const r = await reopenLead(user, uuid.parse(leadId));
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'lead.reopen',
      objectType: 'lead',
      objectId: leadId,
    });
    refresh(leadId);
    return { ok: true, state: r.state, message: 'Lead remis à rappeler.' };
  });
}
