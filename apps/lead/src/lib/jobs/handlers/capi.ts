import 'server-only';
import { eq } from 'drizzle-orm';
import { sha256Hex } from '@/lib/crypto/hash';
import { conversionEvents, leads } from '@/lib/db/schema';
import { asSystem } from '@/lib/db/session';
import {
  CAPI_MAX_AGE_DAYS,
  type CapiEventInput,
  type CapiEventName,
  isCapiConfigured,
  sendCapiEvent,
} from '@/lib/integrations/meta/capi';
import { type JobHandler, registerJob } from '../queue';

/**
 * Module G — envoi d'un événement de conversion à Meta (section 4.7).
 * Journalisé dans `conversion_events` avec la réponse ; un échec réseau
 * relance le job (3 fois, délai croissant) ; un événement trop ancien pour la
 * fenêtre CAPI (7 jours) est marqué pour l'export hors ligne hebdomadaire.
 */
export function capiEventId(leadId: string, eventName: CapiEventName): string {
  return eventName === 'Lead' ? leadId : `${leadId}:${eventName.toLowerCase()}`;
}

const capiSend: JobHandler = async (payload, ctx) => {
  const leadId = String(payload.leadId);
  const eventName = String(payload.eventName) as CapiEventName;
  const appointmentId = payload.appointmentId ? String(payload.appointmentId) : null;
  const eventTime = payload.eventTime ? new Date(String(payload.eventTime)) : null;
  const customData = (payload.customData ?? undefined) as
    | Record<string, string | number>
    | undefined;

  await asSystem(async (tx) => {
    const rows = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    const lead = rows[0];
    if (!lead || lead.deletedAt) return;

    const time = eventTime ?? (eventName === 'Lead' ? lead.receivedAt : ctx.now);
    const eventId = capiEventId(leadId, eventName);
    const input: CapiEventInput = {
      eventName,
      eventId,
      eventTime: time,
      email: lead.email,
      phoneE164: lead.phoneE164,
      clientIp: payload.clientIp ? String(payload.clientIp) : null,
      clientUserAgent: payload.clientUserAgent
        ? String(payload.clientUserAgent)
        : lead.consentUserAgent,
      fbc: lead.fbc,
      fbp: lead.fbp,
      eventSourceUrl: lead.landingUrl,
      customData,
    };
    const payloadHash = sha256Hex(
      JSON.stringify({ eventId, time: time.toISOString(), customData }),
    );

    const tooOld = ctx.now.getTime() - time.getTime() > CAPI_MAX_AGE_DAYS * 24 * 3600 * 1000;
    const base = {
      leadId,
      appointmentId,
      platform: 'meta' as const,
      eventName,
      eventId,
      eventTime: time,
      payloadHash,
    };

    if (!isCapiConfigured() || tooOld) {
      await tx
        .insert(conversionEvents)
        .values({
          ...base,
          deliveredVia: tooOld ? 'offline_pending' : 'not_configured',
          error: tooOld ? null : 'CAPI non configuré',
        })
        .onConflictDoUpdate({
          target: conversionEvents.eventId,
          set: { deliveredVia: tooOld ? 'offline_pending' : 'not_configured' },
        });
      return;
    }

    const res = await sendCapiEvent(input);
    await tx
      .insert(conversionEvents)
      .values({
        ...base,
        sentAt: res.ok ? ctx.now : null,
        responseStatus: res.status,
        error: res.ok ? null : res.error,
        deliveredVia: res.ok ? 'capi' : null,
      })
      .onConflictDoUpdate({
        target: conversionEvents.eventId,
        set: {
          sentAt: res.ok ? ctx.now : null,
          responseStatus: res.status,
          error: res.ok ? null : res.error,
          deliveredVia: res.ok ? 'capi' : null,
        },
      });
    if (!res.ok) throw new Error(`CAPI ${eventName} : ${res.error}`);
  });
};

export function registerCapiJobs(): void {
  registerJob('capi.send', capiSend);
}
