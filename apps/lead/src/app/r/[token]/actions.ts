'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolveSignedLink } from '@/lib/crypto/signed-links';
import { appointments, buyers, leadEvents, leads, sources } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';
import { formatParis } from '@/lib/domain/time';
import { appUrl } from '@/lib/env';
import { broadcastTelegram } from '@/lib/leads/notify';

export type RescheduleState = { error?: string; ok?: string } | null;

const schema = z.object({ message: z.string().trim().min(3).max(600) });

/**
 * « Je ne pourrai pas venir » : on enregistre la demande et on prévient le
 * setter, qui reprogramme (nouveau RDV avec replacement_of). Jamais d'annulation
 * sèche depuis le lien.
 */
export async function requestRescheduleAction(
  token: string,
  _prev: RescheduleState,
  fd: FormData,
): Promise<RescheduleState> {
  const parsed = schema.safeParse({ message: fd.get('message') });
  if (!parsed.success)
    return { error: 'Indiquez-nous en quelques mots le moment qui vous conviendrait.' };
  const ok = await asSystem(async (tx) => {
    const link = await resolveSignedLink(tx, token, 'reschedule');
    if (!link?.appointmentId || !link.leadId) return false;
    const rows = await tx
      .select({ appointment: appointments, lead: leads, buyer: buyers, source: sources })
      .from(appointments)
      .innerJoin(leads, eq(leads.id, appointments.leadId))
      .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .where(eq(appointments.id, link.appointmentId))
      .limit(1);
    const found = rows[0];
    if (!found) return false;
    await tx.insert(leadEvents).values({
      leadId: found.lead.id,
      actorType: 'system',
      kind: 'reschedule_requested',
      payload: { appointment_id: found.appointment.id, message: parsed.data.message, via: 'lien' },
    });
    const html = `📅 <b>${found.lead.firstName}</b> demande à replanifier son rendez-vous du ${formatParis.long(found.appointment.scheduledAt)} avec ${found.buyer.name} :\n« ${parsed.data.message.replace(/</g, '&lt;')} »\n<a href="${appUrl()}/leads/${found.lead.id}">Ouvrir la fiche</a>`;
    await broadcastTelegram(
      tx,
      found.source.id,
      html,
      'appointment.reschedule_requested',
      found.lead.id,
    );
    return true;
  });
  if (!ok)
    return {
      error: 'Ce lien n’est plus valable. Répondez simplement à votre SMS de confirmation.',
    };
  return { ok: 'Bien reçu : nous vous recontactons pour fixer un nouveau moment.' };
}
