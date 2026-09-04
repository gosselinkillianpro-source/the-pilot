import 'server-only';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { type AuthenticatedUser, scopeFor } from '@/lib/auth';
import { appointments, buyers, leads } from '@/lib/db/schema';
import { withDbSession } from '@/lib/db/session';

export type AppointmentListItem = {
  id: string;
  leadId: string;
  firstName: string;
  phoneE164: string;
  answers: Record<string, string>;
  buyerId: string;
  buyerName: string;
  scheduledAt: Date;
  durationMin: number;
  status: (typeof appointments.$inferSelect)['status'];
  conformity: (typeof appointments.$inferSelect)['conformity'];
  validatedAt: Date | null;
  validationDueAt: Date;
  outcome: (typeof appointments.$inferSelect)['outcome'];
  billable: boolean;
  setterNotes: string | null;
};

function toItem(row: {
  appointment: typeof appointments.$inferSelect;
  lead: typeof leads.$inferSelect;
  buyer: typeof buyers.$inferSelect;
}): AppointmentListItem {
  return {
    id: row.appointment.id,
    leadId: row.lead.id,
    firstName: row.lead.firstName,
    phoneE164: row.lead.phoneE164,
    answers: row.lead.answers,
    buyerId: row.buyer.id,
    buyerName: row.buyer.name,
    scheduledAt: row.appointment.scheduledAt,
    durationMin: row.appointment.durationMin,
    status: row.appointment.status,
    conformity: row.appointment.conformity,
    validatedAt: row.appointment.validatedAt,
    validationDueAt: row.appointment.validationDueAt,
    outcome: row.appointment.outcome,
    billable: row.appointment.billable,
    setterNotes: row.appointment.setterNotes,
  };
}

/** Rendez-vous visibles par l'utilisateur (staff : tous ceux de ses sources ; acheteur : les siens via RLS). */
export async function listAppointments(user: AuthenticatedUser, now = new Date()) {
  return withDbSession(scopeFor(user), async (tx) => {
    const base = tx
      .select({ appointment: appointments, lead: leads, buyer: buyers })
      .from(appointments)
      .innerJoin(leads, eq(leads.id, appointments.leadId))
      .innerJoin(buyers, eq(buyers.id, appointments.buyerId));
    const [upcoming, past] = await Promise.all([
      base
        .where(gte(appointments.scheduledAt, now))
        .orderBy(asc(appointments.scheduledAt))
        .limit(200),
      tx
        .select({ appointment: appointments, lead: leads, buyer: buyers })
        .from(appointments)
        .innerJoin(leads, eq(leads.id, appointments.leadId))
        .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
        .where(lt(appointments.scheduledAt, now))
        .orderBy(desc(appointments.scheduledAt))
        .limit(200),
    ]);
    const toValidate = past.filter(
      (r) => r.appointment.status === 'pose' && !r.appointment.validatedAt,
    );
    return {
      toValidate: toValidate.map(toItem),
      upcoming: upcoming.map(toItem),
      past: past
        .filter((r) => !(r.appointment.status === 'pose' && !r.appointment.validatedAt))
        .map(toItem),
    };
  });
}

export async function getAppointment(
  user: AuthenticatedUser,
  id: string,
): Promise<AppointmentListItem | null> {
  return withDbSession(scopeFor(user), async (tx) => {
    const rows = await tx
      .select({ appointment: appointments, lead: leads, buyer: buyers })
      .from(appointments)
      .innerJoin(leads, eq(leads.id, appointments.leadId))
      .innerJoin(buyers, eq(buyers.id, appointments.buyerId))
      .where(and(eq(appointments.id, id)))
      .limit(1);
    return rows[0] ? toItem(rows[0]) : null;
  });
}
