import 'server-only';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { type RoutingPreview, routingPreview } from '@/lib/appointments/book';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import {
  appointments,
  buyers,
  type CriteriaChecks,
  callAttempts,
  campaigns,
  leadEvents,
  leads,
  qualifications,
  sources,
} from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';
import { type BuyerQualification, type UnionCriterion, unionCriteria } from '@/lib/domain/criteria';
import { type SlaColor, slaColor } from '@/lib/domain/sla';
import type { LeadState } from '@/lib/domain/state-machine';
import { addDays, effectiveServiceMinutes, startOfDay } from '@/lib/domain/time';
import { activeBuyersForSource, qualificationsFor } from './qualification';

/** Lectures pour les écrans staff. Toujours au périmètre de l'utilisateur (RLS). */

export type QueueItem = {
  id: string;
  firstName: string;
  phoneE164: string;
  state: LeadState;
  sourceCode: string;
  sourceName: string;
  campaignName: string | null;
  answers: Record<string, string>;
  receivedAt: Date;
  minutesWaiting: number;
  color: SlaColor;
  attemptsCount: number;
  nextAttemptAt: Date | null;
  callbackAt: Date | null;
  firstCallAt: Date | null;
  slaTargetMin: number;
  slaAlertMin: number;
  offHoursReceived: boolean;
};

export async function listCallQueue(
  user: AuthenticatedUser,
  now = new Date(),
): Promise<QueueItem[]> {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ lead: leads, source: sources, campaignName: campaigns.name })
      .from(leads)
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
      .where(
        and(
          isNull(leads.deletedAt),
          or(
            inArray(leads.state, ['a_rappeler', 'en_appel', 'injoignable']),
            and(eq(leads.state, 'a_rappeler_plus_tard'), lt(leads.callbackAt, addDays(now, 1))),
          ),
        ),
      )
      .orderBy(asc(leads.receivedAt));
    return rows.map(({ lead, source, campaignName }) => {
      const minutes =
        lead.firstCallAt !== null
          ? (lead.slaMinutesEffective ?? 0)
          : effectiveServiceMinutes(
              lead.receivedAt,
              now,
              source.serviceHours,
              source.defaultTimezone,
            );
      return {
        id: lead.id,
        firstName: lead.firstName,
        phoneE164: lead.phoneE164,
        state: lead.state,
        sourceCode: source.code,
        sourceName: source.name,
        campaignName,
        answers: lead.answers,
        receivedAt: lead.receivedAt,
        minutesWaiting: minutes,
        color: slaColor(minutes, source.slaTargetMin, source.slaAlertMin),
        attemptsCount: lead.attemptsCount,
        nextAttemptAt: lead.nextAttemptAt,
        callbackAt: lead.callbackAt,
        firstCallAt: lead.firstCallAt,
        slaTargetMin: source.slaTargetMin,
        slaAlertMin: source.slaAlertMin,
        offHoursReceived:
          lead.alertedAt !== null &&
          lead.alertedAt.getTime() - lead.receivedAt.getTime() > 15 * 60000,
      };
    });
  });
}

export type LeadListItem = {
  id: string;
  firstName: string;
  phoneE164: string;
  email: string | null;
  state: LeadState;
  stateReason: string | null;
  sourceCode: string;
  campaignName: string | null;
  buyerName: string | null;
  answers: Record<string, string>;
  receivedAt: Date;
  firstCallAt: Date | null;
  slaMinutesEffective: number | null;
  stateChangedAt: Date;
};

export type LeadFilter = {
  state?: LeadState | LeadState[];
  q?: string;
  sourceId?: string;
  limit?: number;
  offset?: number;
};

export async function listLeads(user: AuthenticatedUser, filter: LeadFilter = {}) {
  return withDbSession(scopeFor(user), async (tx) => {
    const conds = [isNull(leads.deletedAt)];
    if (filter.state)
      conds.push(inArray(leads.state, Array.isArray(filter.state) ? filter.state : [filter.state]));
    if (filter.sourceId) conds.push(eq(leads.sourceId, filter.sourceId));
    if (filter.q?.trim()) {
      const q = `%${filter.q.trim()}%`;
      const digits = filter.q.replace(/\D/g, '');
      const phoneCond =
        digits.length >= 4 ? ilike(leads.phoneE164, `%${digits.slice(-9)}%`) : undefined;
      const textCond = or(
        ilike(leads.firstName, q),
        ilike(leads.email, q),
        ilike(leads.lastName, q),
      );
      conds.push(phoneCond ? or(textCond, phoneCond) : textCond);
    }
    const where = and(...conds);
    const rows = await tx
      .select({
        lead: leads,
        sourceCode: sources.code,
        campaignName: campaigns.name,
        buyerName: buyers.name,
      })
      .from(leads)
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
      .leftJoin(buyers, eq(buyers.id, leads.buyerId))
      .where(where)
      .orderBy(desc(leads.receivedAt))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0);
    const [total] = await tx.select({ n: count() }).from(leads).where(where);
    const items: LeadListItem[] = rows.map(({ lead, sourceCode, campaignName, buyerName }) => ({
      id: lead.id,
      firstName: lead.firstName,
      phoneE164: lead.phoneE164,
      email: lead.email,
      state: lead.state,
      stateReason: lead.stateReason,
      sourceCode,
      campaignName,
      buyerName,
      answers: lead.answers,
      receivedAt: lead.receivedAt,
      firstCallAt: lead.firstCallAt,
      slaMinutesEffective: lead.slaMinutesEffective,
      stateChangedAt: lead.stateChangedAt,
    }));
    return { items, total: total?.n ?? 0 };
  });
}

export async function countLeadsByState(
  user: AuthenticatedUser,
): Promise<Partial<Record<LeadState, number>>> {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ state: leads.state, n: count() })
      .from(leads)
      .where(isNull(leads.deletedAt))
      .groupBy(leads.state);
    const out: Partial<Record<LeadState, number>> = {};
    for (const r of rows) out[r.state] = Number(r.n);
    return out;
  });
}

export type LeadDetail = {
  lead: typeof leads.$inferSelect;
  source: typeof sources.$inferSelect;
  campaign: typeof campaigns.$inferSelect | null;
  events: (typeof leadEvents.$inferSelect)[];
  attempts: (typeof callAttempts.$inferSelect)[];
  qualification: typeof qualifications.$inferSelect | null;
  appointments: { appointment: typeof appointments.$inferSelect; buyerName: string }[];
  buyers: Awaited<ReturnType<typeof activeBuyersForSource>>;
  criteria: UnionCriterion[];
  buyerQualifications: BuyerQualification[];
  routing: RoutingPreview;
  minutesWaiting: number;
  color: SlaColor;
};

export async function getLeadDetail(
  user: AuthenticatedUser,
  leadId: string,
  now = new Date(),
): Promise<LeadDetail | null> {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ lead: leads, source: sources, campaign: campaigns })
      .from(leads)
      .innerJoin(sources, eq(sources.id, leads.sourceId))
      .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
      .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
      .limit(1);
    const found = rows[0];
    if (!found) return null;
    const { lead, source, campaign } = found;
    const [events, attempts, qual, appts, active] = await Promise.all([
      tx
        .select()
        .from(leadEvents)
        .where(eq(leadEvents.leadId, leadId))
        .orderBy(desc(leadEvents.at)),
      tx
        .select()
        .from(callAttempts)
        .where(eq(callAttempts.leadId, leadId))
        .orderBy(desc(callAttempts.startedAt)),
      tx.select().from(qualifications).where(eq(qualifications.leadId, leadId)).limit(1),
      tx
        .select({ appointment: appointments, buyerName: buyers.name })
        .from(appointments)
        .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
        .where(eq(appointments.leadId, leadId))
        .orderBy(desc(appointments.scheduledAt)),
      activeBuyersForSource(tx, source.id),
    ]);
    const checks: CriteriaChecks = qual[0]?.criteria ?? {};
    const criteria = unionCriteria(active, lead.answers);
    const buyerQualifications = qualificationsFor(active, lead.answers, checks);
    const routing = await routingPreview(
      tx,
      source.id,
      lead.answers,
      checks,
      now,
      source.defaultTimezone,
    );
    const minutes =
      lead.firstCallAt !== null
        ? (lead.slaMinutesEffective ?? 0)
        : effectiveServiceMinutes(
            lead.receivedAt,
            now,
            source.serviceHours,
            source.defaultTimezone,
          );
    return {
      lead,
      source,
      campaign,
      events,
      attempts,
      qualification: qual[0] ?? null,
      appointments: appts,
      buyers: active,
      criteria,
      buyerQualifications,
      routing,
      minutesWaiting: minutes,
      color: slaColor(minutes, source.slaTargetMin, source.slaAlertMin),
    };
  });
}

export type DashboardStats = {
  leadsToday: number;
  leadsYesterday: number;
  queueCount: number;
  medianCallbackMinToday: number | null;
  rdvThisWeek: number;
  rdvLastWeek: number;
  awaitingValidationSoon: number;
  leadsPerDay: { day: Date; n: number }[];
  rdvPerDay: { day: Date; n: number }[];
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export async function dashboardStats(
  user: AuthenticatedUser,
  now = new Date(),
): Promise<DashboardStats> {
  return withDbSession(scopeFor(user), async (tx) => {
    const today = startOfDay(now);
    const yesterday = addDays(today, -1);
    const twoWeeksAgo = addDays(today, -13);
    const weekStart = addDays(today, -((new Date(now).getUTCDay() + 6) % 7));
    const lastWeekStart = addDays(weekStart, -7);

    const [todayRows, yRows, queue, called, rdvWeek, rdvLast, awaiting, perDay, rdvDay] =
      await Promise.all([
        tx
          .select({ n: count() })
          .from(leads)
          .where(and(isNull(leads.deletedAt), gte(leads.receivedAt, today))),
        tx
          .select({ n: count() })
          .from(leads)
          .where(
            and(
              isNull(leads.deletedAt),
              gte(leads.receivedAt, yesterday),
              lt(leads.receivedAt, today),
            ),
          ),
        tx
          .select({ n: count() })
          .from(leads)
          .where(and(isNull(leads.deletedAt), eq(leads.state, 'a_rappeler'))),
        tx
          .select({ m: leads.slaMinutesEffective })
          .from(leads)
          .where(and(isNull(leads.deletedAt), gte(leads.firstCallAt, today))),
        tx.select({ n: count() }).from(appointments).where(gte(appointments.createdAt, weekStart)),
        tx
          .select({ n: count() })
          .from(appointments)
          .where(
            and(gte(appointments.createdAt, lastWeekStart), lt(appointments.createdAt, weekStart)),
          ),
        tx
          .select({ n: count() })
          .from(appointments)
          .where(
            and(
              eq(appointments.status, 'pose'),
              isNull(appointments.validatedAt),
              gte(appointments.validationDueAt, now),
              lt(appointments.validationDueAt, new Date(now.getTime() + 4 * 3600000)),
            ),
          ),
        tx
          .select({
            day: sql<string>`date_trunc('day', ${leads.receivedAt} at time zone 'Europe/Paris')`,
            n: count(),
          })
          .from(leads)
          .where(and(isNull(leads.deletedAt), gte(leads.receivedAt, twoWeeksAgo)))
          .groupBy(sql`1`)
          .orderBy(sql`1`),
        tx
          .select({
            day: sql<string>`date_trunc('day', ${appointments.createdAt} at time zone 'Europe/Paris')`,
            n: count(),
          })
          .from(appointments)
          .where(gte(appointments.createdAt, twoWeeksAgo))
          .groupBy(sql`1`)
          .orderBy(sql`1`),
      ]);
    return {
      leadsToday: Number(todayRows[0]?.n ?? 0),
      leadsYesterday: Number(yRows[0]?.n ?? 0),
      queueCount: Number(queue[0]?.n ?? 0),
      medianCallbackMinToday: median(called.map((r) => r.m).filter((m): m is number => m !== null)),
      rdvThisWeek: Number(rdvWeek[0]?.n ?? 0),
      rdvLastWeek: Number(rdvLast[0]?.n ?? 0),
      awaitingValidationSoon: Number(awaiting[0]?.n ?? 0),
      leadsPerDay: perDay.map((r) => ({ day: new Date(r.day), n: Number(r.n) })),
      rdvPerDay: rdvDay.map((r) => ({ day: new Date(r.day), n: Number(r.n) })),
    };
  });
}

export async function listSourcesForUser(user: AuthenticatedUser) {
  return withDbSession(scopeFor(user), (tx) =>
    tx.select().from(sources).orderBy(asc(sources.name)),
  );
}
