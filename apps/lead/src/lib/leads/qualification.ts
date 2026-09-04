import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { type AuthenticatedUser, canAccessSource, scopeFor } from '@/lib/auth';
import {
  type BuyerCriteria,
  buyers,
  type CriteriaChecks,
  callAttempts,
  leadEvents,
  leads,
  qualifications,
  sources,
} from '@/lib/db/schema';
import { asSystem, type Tx, withDbSession } from '@/lib/db/session';
import { MAX_ATTEMPTS, planNextAttempt } from '@/lib/domain/attempts';
import { type BuyerQualification, qualifyForBuyer } from '@/lib/domain/criteria';
import { type LeadEventType, type LeadState, nextState } from '@/lib/domain/state-machine';
import { effectiveServiceMinutes } from '@/lib/domain/time';
import { cancelJobsByKey, enqueueJob } from '@/lib/jobs/queue';

/**
 * Module C — dispositions de la fiche d'appel (section 4.3). Chaque fonction
 * applique une transition de la machine à états, la journalise, et programme
 * les jobs qui en découlent. Toujours dans une session au périmètre de
 * l'utilisateur : la RLS filtre ce qu'il n'a pas le droit de voir.
 */
export class LeadActionError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_STATE'
      | 'INVALID_INPUT'
      | 'NOT_QUALIFIED'
      | 'BUYER_UNAVAILABLE'
      | 'REROUTE_CONSENT_REQUIRED',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LeadActionError';
  }
}

type LeadRow = typeof leads.$inferSelect;
type SourceRow = typeof sources.$inferSelect;

export function actorType(user: AuthenticatedUser): 'admin' | 'setter' | 'buyer' {
  return user.role;
}

export async function loadLeadForUser(
  tx: Tx,
  user: AuthenticatedUser,
  leadId: string,
): Promise<{ lead: LeadRow; source: SourceRow }> {
  const rows = await tx
    .select({ lead: leads, source: sources })
    .from(leads)
    .innerJoin(sources, eq(sources.id, leads.sourceId))
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  const found = rows[0];
  if (!found) throw new LeadActionError('NOT_FOUND');
  if (!canAccessSource(user, found.source.id)) throw new LeadActionError('NOT_FOUND');
  return found;
}

async function transition(
  tx: Tx,
  user: AuthenticatedUser,
  lead: LeadRow,
  event: LeadEventType,
  now: Date,
  extra: Partial<typeof leads.$inferInsert> = {},
  payload: Record<string, unknown> = {},
  ctx: { attemptsCount?: number; maxAttempts?: number } = {},
): Promise<LeadState> {
  let to: LeadState;
  try {
    to = nextState(lead.state, event, ctx);
  } catch {
    throw new LeadActionError(
      'INVALID_STATE',
      `Action « ${event} » impossible depuis l’état « ${lead.state} ».`,
    );
  }
  await tx
    .update(leads)
    .set({ state: to, stateChangedAt: now, ...extra })
    .where(eq(leads.id, lead.id));
  await tx.insert(leadEvents).values({
    leadId: lead.id,
    actorType: actorType(user),
    actorId: user.id,
    fromState: lead.state,
    toState: to,
    kind: event,
    payload,
    at: now,
  });
  return to;
}

async function closeOpenAttempt(
  tx: Tx,
  leadId: string,
  outcome: 'repondu' | 'messagerie' | 'occupe' | 'faux_numero',
  now: Date,
  notes?: string,
): Promise<void> {
  const open = await tx
    .select({ id: callAttempts.id })
    .from(callAttempts)
    .where(and(eq(callAttempts.leadId, leadId), isNull(callAttempts.endedAt)))
    .limit(1);
  const id = open[0]?.id;
  if (!id) return;
  await tx
    .update(callAttempts)
    .set({ endedAt: now, outcome, notes: notes ?? null })
    .where(eq(callAttempts.id, id));
}

/** « J'appelle » : fixe first_call_at UNE fois, ouvre une tentative, annule les escalades SLA. */
export async function startCall(user: AuthenticatedUser, leadId: string, now = new Date()) {
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead, source } = await loadLeadForUser(tx, user, leadId);
    const firstCallAt = lead.firstCallAt ?? now;
    const slaMinutesEffective =
      lead.firstCallAt !== null
        ? lead.slaMinutesEffective
        : Math.round(
            effectiveServiceMinutes(
              lead.receivedAt,
              now,
              source.serviceHours,
              source.defaultTimezone,
            ),
          );
    const to = await transition(tx, user, lead, 'call_started', now, {
      firstCallAt,
      slaMinutesEffective,
    });
    const open = await tx
      .select({ id: callAttempts.id })
      .from(callAttempts)
      .where(and(eq(callAttempts.leadId, leadId), isNull(callAttempts.endedAt)))
      .limit(1);
    if (!open[0]) {
      await tx.insert(callAttempts).values({ leadId, setterId: user.id, startedAt: now });
    }
    if (!lead.firstCallAt) {
      await cancelJobsByKey(tx, `lead.sla:${leadId}:1`);
      await cancelJobsByKey(tx, `lead.sla:${leadId}:2`);
    }
    return { state: to, firstCallAt, slaMinutesEffective };
  });
}

/** « Injoignable » : tentative manquée, relance planifiée ou passage injoignable. */
export async function markUnreachable(
  user: AuthenticatedUser,
  leadId: string,
  outcome: 'messagerie' | 'occupe',
  now = new Date(),
) {
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead, source } = await loadLeadForUser(tx, user, leadId);
    if (lead.state !== 'en_appel')
      throw new LeadActionError('INVALID_STATE', 'Cliquez d’abord sur « J’appelle ».');
    await closeOpenAttempt(tx, leadId, outcome, now);
    const plan = planNextAttempt(
      lead.attemptsCount,
      now,
      source.serviceHours,
      source.defaultTimezone,
    );
    const to = await transition(
      tx,
      user,
      lead,
      'attempt_missed',
      now,
      {
        attemptsCount: plan.attemptsCount,
        nextAttemptAt: plan.outcome === 'retry' ? plan.nextAttemptAt : null,
      },
      {
        outcome,
        attempt: plan.attemptsCount,
        next_attempt_at: plan.outcome === 'retry' ? plan.nextAttemptAt.toISOString() : null,
      },
      { attemptsCount: plan.attemptsCount, maxAttempts: MAX_ATTEMPTS },
    );
    if (plan.outcome === 'retry') {
      await enqueueJob(tx, {
        kind: 'lead.attempt_due',
        payload: { leadId, attempt: plan.attemptsCount + 1 },
        runAt: plan.nextAttemptAt,
        idempotencyKey: `lead.attempt:${leadId}:${plan.attemptsCount + 1}`,
      });
      if (plan.sendSlotSms) {
        await enqueueJob(tx, {
          kind: 'lead.slot_sms',
          payload: { leadId },
          idempotencyKey: `lead.slot_sms:${leadId}`,
        });
      }
    }
    return { state: to, plan };
  });
}

/** « Rappeler plus tard » : date convenue avec le lead. */
export async function callbackLater(
  user: AuthenticatedUser,
  leadId: string,
  at: Date,
  now = new Date(),
) {
  if (!(at > now))
    throw new LeadActionError('INVALID_INPUT', 'La date de rappel doit être dans le futur.');
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead } = await loadLeadForUser(tx, user, leadId);
    await closeOpenAttempt(tx, leadId, 'repondu', now);
    const to = await transition(
      tx,
      user,
      lead,
      'callback_later',
      now,
      { callbackAt: at, nextAttemptAt: null },
      { callback_at: at.toISOString() },
    );
    await enqueueJob(tx, {
      kind: 'lead.callback_due',
      payload: { leadId },
      runAt: at,
      idempotencyKey: `lead.callback:${leadId}:${at.getTime()}`,
    });
    return { state: to };
  });
}

/** Le lead choisit lui-même un moment via le lien SMS (rôle system). */
export async function requestCallbackViaLink(leadId: string, at: Date, now = new Date()) {
  return asSystem(async (tx) => {
    const rows = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    const lead = rows[0];
    if (!lead) throw new LeadActionError('NOT_FOUND');
    let to: LeadState;
    try {
      to = nextState(lead.state, 'callback_requested');
    } catch {
      throw new LeadActionError('INVALID_STATE');
    }
    await tx
      .update(leads)
      .set({ state: to, stateChangedAt: now, callbackAt: at, nextAttemptAt: null })
      .where(eq(leads.id, leadId));
    await tx.insert(leadEvents).values({
      leadId,
      actorType: 'system',
      fromState: lead.state,
      toState: to,
      kind: 'callback_requested',
      payload: { callback_at: at.toISOString(), via: 'sms_link' },
      at: now,
    });
    await enqueueJob(tx, {
      kind: 'lead.callback_due',
      payload: { leadId },
      runAt: at,
      idempotencyKey: `lead.callback:${leadId}:${at.getTime()}`,
    });
    return { state: to };
  });
}

export async function nurtureLead(
  user: AuthenticatedUser,
  leadId: string,
  reason: 'curiosite' | 'montant_sous_seuil' | 'pas_maintenant',
  now = new Date(),
) {
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead } = await loadLeadForUser(tx, user, leadId);
    await closeOpenAttempt(tx, leadId, 'repondu', now);
    const to = await transition(
      tx,
      user,
      lead,
      'nurture',
      now,
      { nurtureReason: reason, nextAttemptAt: null },
      { reason },
    );
    return { state: to };
  });
}

export type HorsCibleReason =
  | 'doublon'
  | 'faux_numero'
  | 'montant_hors_criteres'
  | 'timing_hors_criteres'
  | 'hors_zone'
  | 'deja_client'
  | 'pas_interesse'
  | 'autre';

export async function markOutOfTarget(
  user: AuthenticatedUser,
  leadId: string,
  reason: HorsCibleReason,
  note?: string,
  now = new Date(),
) {
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead } = await loadLeadForUser(tx, user, leadId);
    await closeOpenAttempt(
      tx,
      leadId,
      reason === 'faux_numero' ? 'faux_numero' : 'repondu',
      now,
      note,
    );
    const to = await transition(
      tx,
      user,
      lead,
      'out_of_target',
      now,
      { stateReason: reason, nextAttemptAt: null },
      { reason, note: note ?? null },
    );
    return { state: to };
  });
}

export async function reopenLead(user: AuthenticatedUser, leadId: string, now = new Date()) {
  if (user.role !== 'admin') throw new LeadActionError('FORBIDDEN');
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead } = await loadLeadForUser(tx, user, leadId);
    const to = await transition(tx, user, lead, 'reopened', now, {
      stateReason: null,
      nurtureReason: null,
    });
    return { state: to };
  });
}

export async function saveNotes(user: AuthenticatedUser, leadId: string, notes: string) {
  return withDbSession(scopeFor(user), async (tx) => {
    await loadLeadForUser(tx, user, leadId);
    await tx
      .insert(qualifications)
      .values({ leadId, setterId: user.id, notes })
      .onConflictDoUpdate({ target: qualifications.leadId, set: { notes, setterId: user.id } });
    return { ok: true };
  });
}

export type ActiveBuyer = {
  id: string;
  name: string;
  criteria: BuyerCriteria;
  calendarProvider: (typeof buyers.$inferSelect)['calendarProvider'];
  calendarConfig: (typeof buyers.$inferSelect)['calendarConfig'];
  pricePerRdvCents: number;
  validationDelayHours: number;
};

export async function activeBuyersForSource(tx: Tx, sourceId: string): Promise<ActiveBuyer[]> {
  const rows = await tx
    .select({
      id: buyers.id,
      name: buyers.name,
      criteria: buyers.criteria,
      calendarProvider: buyers.calendarProvider,
      calendarConfig: buyers.calendarConfig,
      pricePerRdvCents: buyers.pricePerRdvCents,
      validationDelayHours: buyers.validationDelayHours,
    })
    .from(buyers)
    .where(and(eq(buyers.sourceId, sourceId), eq(buyers.active, true)));
  return rows;
}

export function qualificationsFor(
  activeBuyers: ActiveBuyer[],
  answers: Record<string, string>,
  checks: CriteriaChecks,
): BuyerQualification[] {
  return activeBuyers.map((b) => qualifyForBuyer(b.id, b.criteria, answers, checks));
}

/** Coche les critères ; le score stocké = meilleur score parmi les acheteurs actifs. */
export async function saveCriteria(
  user: AuthenticatedUser,
  leadId: string,
  checks: CriteriaChecks,
) {
  return withDbSession(scopeFor(user), async (tx) => {
    const { lead, source } = await loadLeadForUser(tx, user, leadId);
    const active = await activeBuyersForSource(tx, source.id);
    const quals = qualificationsFor(active, lead.answers, checks);
    const score = quals.reduce((m, q) => Math.max(m, q.score), 0);
    await tx
      .insert(qualifications)
      .values({ leadId, setterId: user.id, criteria: checks, score })
      .onConflictDoUpdate({
        target: qualifications.leadId,
        set: { criteria: checks, score, setterId: user.id },
      });
    return { score, qualifications: quals };
  });
}
