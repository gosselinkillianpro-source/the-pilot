import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Fiche PROSPECT d'un rendez-vous Calendly : la personne existe chez nous
 * (rdv_contacts) même sans compte SAH. La fiche permet d'enregistrer les
 * appels, prendre des notes, voir le téléphone — tout ce qu'on sait d'elle
 * avant son inscription. Dès qu'elle s'inscrit (ou qu'on la relie à la main),
 * la page redirige vers la vraie fiche investisseur.
 */

export type RdvContactDetail = {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  source: string;
  stage: string | null;
  investorId: string | null;
  ownerName: string | null;
  createdAt: Date;
};

export async function getRdvContactDetail(id: string): Promise<RdvContactDetail | null> {
  const rows = await db.execute(sql`
    select c.id::text as id, c.full_name, c.calendly_email as email, c.phone, c.notes,
           c.source, c.pipeline_stage as stage, c.investor_id::text as investor_id,
           u.full_name as owner_name, c.created_at
    from rdv_contacts c
    left join users u on u.id = c.owner_user_id
    where c.id = ${id}
    limit 1
  `);
  const r = (rows as unknown as Record<string, string | null>[])[0];
  if (!r) return null;
  return {
    id: String(r.id),
    fullName: r.full_name ?? null,
    email: String(r.email),
    phone: r.phone ?? null,
    notes: r.notes ?? null,
    source: String(r.source),
    stage: r.stage ?? null,
    investorId: r.investor_id ?? null,
    ownerName: r.owner_name ?? null,
    createdAt: new Date(String(r.created_at)),
  };
}

export type ContactTimelineItem = {
  id: string;
  type: string;
  outcome: string | null;
  note: string | null;
  userName: string | null;
  createdAt: Date;
};

/** Historique de la fiche : appels enregistrés, notes, envois — le plus récent d'abord. */
export async function getContactTimeline(
  contactId: string,
  limit = 30,
): Promise<ContactTimelineItem[]> {
  const rows = await db.execute(sql`
    select i.id::text as id, i.type, i.outcome, i.note, u.full_name as user_name, i.created_at
    from interactions i
    left join users u on u.id = i.user_id
    where i.rdv_contact_id = ${contactId}
    order by i.created_at desc
    limit ${limit}
  `);
  return (rows as unknown as Record<string, string | null>[]).map((r) => ({
    id: String(r.id),
    type: String(r.type),
    outcome: r.outcome ?? null,
    note: r.note ?? null,
    userName: r.user_name ?? null,
    createdAt: new Date(String(r.created_at)),
  }));
}

export type ContactReminder = { id: string; dueAt: Date; note: string | null };

/** Rappels en attente sur cette fiche. */
export async function getContactReminders(contactId: string): Promise<ContactReminder[]> {
  const rows = await db.execute(sql`
    select t.id::text as id, t.due_at, t.note
    from closer_tasks t
    where t.rdv_contact_id = ${contactId} and t.status = 'pending'
    order by t.due_at asc
  `);
  return (rows as unknown as Record<string, string | null>[]).map((r) => ({
    id: String(r.id),
    dueAt: new Date(String(r.due_at)),
    note: r.note ?? null,
  }));
}
