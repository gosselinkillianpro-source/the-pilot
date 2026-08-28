import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Rappels du closer (`closer_tasks`).
 *
 * Ils existaient déjà — 4 en attente, 9 faits — mais on ne pouvait en créer un
 * que depuis un écran de qualification d'appel, et on ne les voyait nulle part
 * à côté des rendez-vous. Or un rappel EST un rendez-vous avec soi-même : il
 * doit apparaître dans l'agenda, sinon il n'existe pas dans la journée.
 */

export type Reminder = {
  id: string;
  dueAt: Date;
  note: string | null;
  type: string;
  /** La personne concernée, quel que soit son statut (investisseur ou prospect). */
  who: string | null;
  investorId: string | null;
  contactId: string | null;
  phone: string | null;
  /** Le rappel est passé et toujours en attente. */
  overdue: boolean;
};

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

/**
 * Rappels en attente d'un closer, du plus urgent au plus lointain.
 *
 * Les rappels EN RETARD viennent en premier : ce sont eux qu'on oublie, et
 * chaque jour de retard coûte une chance de joindre la personne.
 */
export async function listReminders(userId: string, limit = 50): Promise<Reminder[]> {
  const rows = await db.execute(sql`
    select
      t.id::text as id,
      t.due_at,
      t.note,
      t.type,
      t.investor_id::text as investor_id,
      t.rdv_contact_id::text as contact_id,
      coalesce(
        nullif(trim(i.full_name), ''),
        nullif(trim(c.full_name), ''),
        i.email,
        c.calendly_email
      ) as who,
      coalesce(i.phone, c.phone) as phone,
      t.due_at < now() as overdue
    from closer_tasks t
    left join investors i on i.id = t.investor_id
    left join rdv_contacts c on c.id = t.rdv_contact_id
    where t.status = 'pending' and t.closer_id = ${userId}
    order by t.due_at asc
    limit ${limit}
  `);

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    dueAt: toDate(r.due_at),
    note: r.note ? String(r.note) : null,
    type: String(r.type),
    who: r.who ? String(r.who) : null,
    investorId: r.investor_id ? String(r.investor_id) : null,
    contactId: r.contact_id ? String(r.contact_id) : null,
    phone: r.phone ? String(r.phone) : null,
    overdue: r.overdue === true,
  }));
}

/** Personnes proposées à la création d'un rappel : celles que ce closer suit. */
export type ReminderTarget = { id: string; kind: 'investor' | 'contact'; label: string };

export async function listReminderTargets(userId: string, limit = 200): Promise<ReminderTarget[]> {
  const rows = await db.execute(sql`
    (
      select i.id::text as id, 'investor' as kind,
        coalesce(nullif(trim(i.full_name), ''), i.email) as label,
        coalesce(i.pipeline_stage_updated_at, i.updated_at) as sort_at
      from investors i
      where i.deleted_at is null and i.assigned_closer_id = ${userId}
    )
    union all
    (
      select c.id::text as id, 'contact' as kind,
        coalesce(nullif(trim(c.full_name), ''), c.calendly_email) as label,
        c.updated_at as sort_at
      from rdv_contacts c
      where c.owner_user_id = ${userId} and c.investor_id is null
    )
    order by sort_at desc nulls last
    limit ${limit}
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    kind: String(r.kind) === 'investor' ? 'investor' : 'contact',
    label: String(r.label),
  }));
}
