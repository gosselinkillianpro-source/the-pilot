import 'server-only';
import { and, desc, eq, gte, inArray, isNull, lt, max, sql } from 'drizzle-orm';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { appointments, buyers, leadEvents, leads, packs, qualifications } from '@/lib/db/schema';
import { type Tx, withDbSession } from '@/lib/db/session';
import { type RoutingCandidate, type RoutingResult, rankCandidates } from '@/lib/domain/routing';
import { nextState } from '@/lib/domain/state-machine';
import { addDays, addMinutes, startOfDay, todayAt, weekMonday } from '@/lib/domain/time';
import { enqueueJob } from '@/lib/jobs/queue';
import {
  activeBuyersForSource,
  actorType,
  LeadActionError,
  loadLeadForUser,
  qualificationsFor,
} from '@/lib/leads/qualification';

/**
 * « RDV posé » — modules D (agenda) et E (routage), version v0 :
 * l'algorithme de routage est complet (critères, plafonds, packs, priorité,
 * équité), la date est saisie par le setter ou remplie par le webhook Calendly.
 */
export type RoutingPreview = RoutingResult & { qualified: string[] };

async function buildCandidates(
  tx: Tx,
  sourceId: string,
  now: Date,
  tz: string,
): Promise<RoutingCandidate[]> {
  const rows = await tx.select().from(buyers).where(eq(buyers.sourceId, sourceId));
  const dayStart = startOfDay(now, tz);
  const dayEnd = addDays(dayStart, 1);
  const weekStart = weekMonday(now, tz);
  const weekEnd = addDays(weekStart, 7);
  const out: RoutingCandidate[] = [];
  for (const b of rows) {
    const [daily] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.buyerId, b.id),
          inArray(appointments.status, ['pose', 'honore']),
          gte(appointments.scheduledAt, dayStart),
          lt(appointments.scheduledAt, dayEnd),
        ),
      );
    const [weekly] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.buyerId, b.id),
          inArray(appointments.status, ['pose', 'honore']),
          gte(appointments.scheduledAt, weekStart),
          lt(appointments.scheduledAt, weekEnd),
        ),
      );
    const pack = await tx
      .select({ remaining: packs.remaining })
      .from(packs)
      .where(and(eq(packs.buyerId, b.id), eq(packs.status, 'actif'), eq(packs.prepaid, true)))
      .orderBy(packs.createdAt)
      .limit(1);
    const [last] = await tx
      .select({ at: max(leads.routedAt) })
      .from(leads)
      .where(eq(leads.buyerId, b.id));
    out.push({
      buyerId: b.id,
      name: b.name,
      active: b.active,
      pausedUntil: b.pausedUntil,
      priority: b.priority,
      dailyCap: b.dailyCap,
      weeklyCap: b.weeklyCap,
      dailyCount: daily?.n ?? 0,
      weeklyCount: weekly?.n ?? 0,
      packRemaining: pack[0] ? pack[0].remaining : null,
      lastRoutedAt: last?.at ?? null,
    });
  }
  return out;
}

/** Aperçu du routage pour la fiche : qui recevrait ce lead, et pourquoi les autres non. */
export async function routingPreview(
  tx: Tx,
  sourceId: string,
  answers: Record<string, string>,
  checks: Record<string, boolean | null>,
  now: Date,
  tz: string,
): Promise<RoutingPreview> {
  const active = await activeBuyersForSource(tx, sourceId);
  const quals = qualificationsFor(active, answers, checks);
  const qualified = new Set(quals.filter((q) => q.qualified).map((q) => q.buyerId));
  const candidates = await buildCandidates(tx, sourceId, now, tz);
  return { ...rankCandidates(candidates, qualified, now), qualified: [...qualified] };
}

export type BookInput = {
  leadId: string;
  buyerId: string;
  scheduledAt: Date;
  durationMin?: number;
  setterNotes?: string;
  /** Obligatoire si l'acheteur choisi n'est pas le premier proposé par le routage. */
  routingReason?: string;
  calendarEventId?: string;
  bookingUrl?: string;
};

export async function bookAppointment(user: AuthenticatedUser, input: BookInput, now = new Date()) {
  if (!(input.scheduledAt > now))
    throw new LeadActionError('INVALID_INPUT', 'Le rendez-vous doit être dans le futur.');
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead, source } = await loadLeadForUser(tx, user, input.leadId);
    if (!['en_appel', 'qualifie'].includes(lead.state)) {
      throw new LeadActionError('INVALID_STATE', 'Cliquez d’abord sur « J’appelle ».');
    }
    if (!lead.consentPartnerTransfer) {
      throw new LeadActionError('FORBIDDEN', 'Pas de consentement à la transmission.');
    }
    // RGPD : un lead déjà routé ailleurs exige un nouveau consentement horodaté.
    if (lead.buyerId && lead.buyerId !== input.buyerId && !lead.rerouteConsentAt) {
      throw new LeadActionError('REROUTE_CONSENT_REQUIRED');
    }

    const qualRow = await tx
      .select()
      .from(qualifications)
      .where(eq(qualifications.leadId, lead.id))
      .limit(1);
    const checks = qualRow[0]?.criteria ?? {};
    const preview = await routingPreview(
      tx,
      source.id,
      lead.answers,
      checks,
      now,
      source.defaultTimezone,
    );
    if (!preview.qualified.includes(input.buyerId)) {
      throw new LeadActionError(
        'NOT_QUALIFIED',
        'Les critères obligatoires de cet acheteur ne sont pas tous à « oui ».',
      );
    }
    const eligibleIds = preview.eligible.map((c) => c.buyerId);
    if (!eligibleIds.includes(input.buyerId)) {
      const why =
        preview.excluded.find((e) => e.candidate.buyerId === input.buyerId)?.reason ??
        'indisponible';
      throw new LeadActionError('BUYER_UNAVAILABLE', `Acheteur indisponible : ${why}.`);
    }
    const first = eligibleIds[0];
    if (first !== input.buyerId && !input.routingReason?.trim()) {
      throw new LeadActionError(
        'INVALID_INPUT',
        'Choisir un autre acheteur que celui proposé exige un motif.',
      );
    }

    const buyerRow = await tx.select().from(buyers).where(eq(buyers.id, input.buyerId)).limit(1);
    const buyer = buyerRow[0];
    if (!buyer) throw new LeadActionError('NOT_FOUND');

    // Deux transitions journalisées : qualifié, puis RDV posé.
    const stateQualified =
      lead.state === 'qualifie' ? 'qualifie' : nextState(lead.state, 'qualified');
    if (lead.state !== 'qualifie') {
      await tx.insert(leadEvents).values({
        leadId: lead.id,
        actorType: actorType(user),
        actorId: user.id,
        fromState: lead.state,
        toState: stateQualified,
        kind: 'qualified',
        at: now,
      });
    }
    const statePosed = nextState(stateQualified, 'rdv_posed');
    await tx
      .update(leads)
      .set({
        state: statePosed,
        stateChangedAt: now,
        buyerId: buyer.id,
        routedAt: now,
        nextAttemptAt: null,
        callbackAt: null,
      })
      .where(eq(leads.id, lead.id));
    await tx.insert(leadEvents).values({
      leadId: lead.id,
      actorType: actorType(user),
      actorId: user.id,
      fromState: stateQualified,
      toState: statePosed,
      kind: 'rdv_posed',
      payload: {
        buyer_id: buyer.id,
        scheduled_at: input.scheduledAt.toISOString(),
        routing_first_choice: first ?? null,
        routing_reason: input.routingReason ?? null,
      },
      at: now,
    });

    await tx
      .update(qualifications)
      .set({ disposition: 'rdv_pose', qualifiedAt: now, setterId: user.id })
      .where(eq(qualifications.leadId, lead.id));
    if (!qualRow[0]) {
      await tx
        .insert(qualifications)
        .values({ leadId: lead.id, setterId: user.id, disposition: 'rdv_pose', qualifiedAt: now });
    }

    const activePack = await tx
      .select({ id: packs.id })
      .from(packs)
      .where(and(eq(packs.buyerId, buyer.id), eq(packs.status, 'actif')))
      .orderBy(packs.createdAt)
      .limit(1);

    const inserted = await tx
      .insert(appointments)
      .values({
        leadId: lead.id,
        buyerId: buyer.id,
        scheduledAt: input.scheduledAt,
        durationMin: input.durationMin ?? buyer.calendarConfig?.duration_min ?? 30,
        calendarEventId: input.calendarEventId ?? null,
        bookingUrl: input.bookingUrl ?? null,
        validationDueAt: addMinutes(input.scheduledAt, buyer.validationDelayHours * 60),
        packId: activePack[0]?.id ?? null,
        setterNotes: input.setterNotes ?? null,
      })
      .returning({ id: appointments.id });
    const appointmentId = inserted[0]?.id;
    if (!appointmentId) throw new Error('rendez-vous sans identifiant');

    // Tentative en cours : répondu.
    await tx.execute(sql`
      update lead.call_attempts set ended_at = ${now}, outcome = 'repondu'
      where lead_id = ${lead.id} and ended_at is null
    `);

    await enqueueJob(tx, {
      kind: 'capi.send',
      payload: {
        leadId: lead.id,
        eventName: 'Schedule',
        appointmentId,
        eventTime: now.toISOString(),
        customData: { buyer: buyer.id },
      },
      idempotencyKey: `capi:Schedule:${lead.id}:${appointmentId}`,
    });
    await enqueueJob(tx, {
      kind: 'appointment.confirmations',
      payload: { appointmentId },
      idempotencyKey: `appointment.confirmations:${appointmentId}`,
    });
    const j1 = todayAt(addDays(input.scheduledAt, -1), '18:00', source.defaultTimezone);
    if (j1 > now) {
      await enqueueJob(tx, {
        kind: 'appointment.reminder',
        payload: { appointmentId, kind: 'j1' },
        runAt: j1,
        idempotencyKey: `appointment.reminder:${appointmentId}:j1`,
      });
    }
    const h2 = addMinutes(input.scheduledAt, -120);
    if (h2 > now) {
      await enqueueJob(tx, {
        kind: 'appointment.reminder',
        payload: { appointmentId, kind: 'h2' },
        runAt: h2,
        idempotencyKey: `appointment.reminder:${appointmentId}:h2`,
      });
    }
    return { appointmentId, state: statePosed, buyerName: buyer.name };
  });
}

/** Derniers rendez-vous d'un lead (fiche). */
export async function appointmentsForLead(tx: Tx, leadId: string) {
  return tx
    .select({ appointment: appointments, buyerName: buyers.name })
    .from(appointments)
    .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
    .where(and(eq(appointments.leadId, leadId), isNull(appointments.replacementOf)))
    .orderBy(desc(appointments.scheduledAt));
}
