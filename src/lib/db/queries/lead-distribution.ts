import 'server-only';
import { sql } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import {
  DISTRIBUTION_WINDOW_DAYS,
  isStaleAssignment,
  pickNextCloser,
  REDISTRIBUTION_AFTER_HOURS,
  type RotationCloser,
} from '@/lib/closing/distribution';
import { db } from '@/lib/db';
import { CLAIM_TTL_MIN } from './call-queue';

/**
 * Répartition des nouveaux inscrits — accès base.
 *
 * `distributeNewLeads` : chaque inscrit libre de moins de 7 jours, quelle que
 * soit son origine, va au prochain closer de la rotation (voir
 * `lib/closing/distribution.ts`).
 * `redistributeStaleLeads` : ceux restés 72 h sans action changent de main.
 * Les deux sont idempotentes et rejouables toutes les 2 minutes.
 */

export type RotationMember = RotationCloser & {
  name: string | null;
  telegramChatId: string | null;
};

type RotationRaw = {
  id: string;
  full_name: string | null;
  last_lead_distributed_at: string | Date | null;
  telegram_chat_id: string | null;
};

/** Les closers qui reçoivent les nouveaux leads (actifs, réglage admin). */
export async function listRotationClosers(): Promise<RotationMember[]> {
  const rows = (await db.execute(sql`
    select id::text as id, full_name, last_lead_distributed_at, telegram_chat_id
    from users
    where active and accepts_new_leads and role in ('closer', 'closer_junior')
  `)) as unknown as RotationRaw[];
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    lastLeadDistributedAt: r.last_lead_distributed_at ? new Date(r.last_lead_distributed_at) : null,
    telegramChatId: r.telegram_chat_id,
  }));
}

export type DistributedLead = {
  investorId: string;
  fullName: string | null;
  closerId: string;
  closerName: string | null;
};

type CandidateRaw = { id: string; full_name: string | null };

/** Même exclusion que le pool : un RDV Calendly pris, c'est Guillaume qui suit. */
const NOT_CALENDLY = sql`not exists (
  select 1 from rdv_contacts rc
  where rc.source = 'calendly'
    and (rc.investor_id = i.id or lower(rc.calendly_email) = lower(i.email))
)`;

async function markServed(closer: RotationCloser, at: Date): Promise<void> {
  await db.execute(
    sql`update users set last_lead_distributed_at = ${at.toISOString()}::timestamptz where id = ${closer.id}`,
  );
  closer.lastLeadDistributedAt = at;
}

/**
 * Attribue les inscrits libres et récents, à tour de rôle, quelle que soit leur
 * origine. Ne touche ni aux personnes déjà suivies (dont les clients des
 * closers CGP, attribués avant par la règle CGP), ni à celles qu'un closer a
 * réservées (« Je prends » actif), ni aux clos, ni aux rendez-vous Calendly.
 */
export async function distributeNewLeads(now: Date = new Date()): Promise<DistributedLead[]> {
  const rotation = await listRotationClosers();
  if (rotation.length === 0) return [];
  // Paramètres datés castés explicitement : `$1 - interval` sans type est ambigu pour Postgres.
  const nowIso = now.toISOString();

  const rows = (await db.execute(sql`
    select i.id::text as id, i.full_name
    from investors i
    where i.deleted_at is null
      and i.assigned_closer_id is null
      and i.sah_created_at is not null
      and i.sah_created_at >= ${nowIso}::timestamptz - (${DISTRIBUTION_WINDOW_DAYS}::int * interval '1 day')
      and i.pipeline_stage not in ('closed_won', 'closed_lost')
      and (i.claimed_by_id is null or i.claimed_at is null
           or i.claimed_at < ${nowIso}::timestamptz - (${CLAIM_TTL_MIN}::int * interval '1 minute'))
      and ${NOT_CALENDLY}
    order by i.sah_created_at asc
  `)) as unknown as CandidateRaw[];

  const out: DistributedLead[] = [];
  for (const [i, lead] of rows.entries()) {
    const closer = pickNextCloser(rotation);
    if (!closer) break;
    // Garde-fou concurrent : si quelqu'un vient d'enregistrer un appel, la
    // personne est à lui (propriété collante) et on ne la lui reprend pas.
    const updated = (await db.execute(sql`
      update investors
        set assigned_closer_id = ${closer.id}, assigned_at = ${nowIso}::timestamptz,
            assignment_source = 'distribution', updated_at = now()
      where id = ${lead.id} and assigned_closer_id is null
      returning id
    `)) as unknown as { id: string }[];
    if (updated.length === 0) continue;
    // + i ms : deux leads dans la même seconde font quand même tourner la rotation.
    await markServed(closer, new Date(now.getTime() + i));
    out.push({
      investorId: lead.id,
      fullName: lead.full_name,
      closerId: closer.id,
      closerName: closer.name,
    });
    await logAudit({
      userId: null,
      userEmail: 'system:lead-distribution',
      action: 'closing.lead_distributed',
      resourceType: 'investor',
      resourceId: lead.id,
      metadata: {
        closerId: closer.id,
        closerName: closer.name,
        rule: 'tour de rôle, moins récemment servi',
      },
    });
  }
  return out;
}

export type RedistributedLead = {
  investorId: string;
  fullName: string | null;
  fromCloserId: string;
  fromCloserName: string | null;
  toCloserId: string;
  toCloserName: string | null;
  toTelegramChatId: string | null;
  redistributionCount: number;
  hoursIdle: number;
};

type StaleRaw = {
  id: string;
  full_name: string | null;
  assigned_closer_id: string;
  from_name: string | null;
  assigned_at: string | Date;
  last_owner_action_at: string | Date | null;
};

/**
 * Reprend les leads répartis restés 72 h sans la moindre action de leur closer
 * (interaction ou action planifiée depuis l'attribution) et les donne au
 * suivant de la rotation — jamais au même. Un closer seul dans la rotation
 * garde ses leads : mieux vaut un lead en retard qu'un lead perdu.
 */
export async function redistributeStaleLeads(now: Date = new Date()): Promise<RedistributedLead[]> {
  const rotation = await listRotationClosers();
  if (rotation.length < 2) return [];
  const nowIso = now.toISOString();

  const rows = (await db.execute(sql`
    select i.id::text as id, i.full_name, i.assigned_closer_id::text as assigned_closer_id,
           u.full_name as from_name, i.assigned_at,
           (select max(ix.created_at) from interactions ix
             where ix.investor_id = i.id and ix.user_id = i.assigned_closer_id) as last_owner_action_at
    from investors i
    join users u on u.id = i.assigned_closer_id
    where i.deleted_at is null
      and i.assignment_source in ('distribution', 'redistribution')
      and i.assigned_at is not null
      and i.assigned_at <= ${nowIso}::timestamptz - (${REDISTRIBUTION_AFTER_HOURS}::int * interval '1 hour')
      and i.pipeline_stage not in ('closed_won', 'closed_lost')
      and not exists (
        select 1 from closer_tasks ct
        where ct.investor_id = i.id and ct.created_by = i.assigned_closer_id and ct.created_at >= i.assigned_at
      )
    order by i.assigned_at asc
  `)) as unknown as StaleRaw[];

  const out: RedistributedLead[] = [];
  for (const [i, row] of rows.entries()) {
    const assignedAt = new Date(row.assigned_at);
    const lastOwnerActionAt = row.last_owner_action_at ? new Date(row.last_owner_action_at) : null;
    if (!isStaleAssignment({ assignedAt, lastOwnerActionAt }, now)) continue;
    const next = pickNextCloser(rotation, [row.assigned_closer_id]);
    if (!next) continue;

    const updated = (await db.execute(sql`
      update investors
        set assigned_closer_id = ${next.id}, assigned_at = ${nowIso}::timestamptz,
            assignment_source = 'redistribution',
            redistribution_count = redistribution_count + 1,
            claimed_by_id = null, claimed_at = null, updated_at = now()
      where id = ${row.id} and assigned_closer_id = ${row.assigned_closer_id}
      returning redistribution_count
    `)) as unknown as { redistribution_count: number }[];
    if (updated.length === 0) continue;
    await markServed(next, new Date(now.getTime() + i));

    const hoursIdle = Math.round((now.getTime() - assignedAt.getTime()) / 3_600_000);
    out.push({
      investorId: row.id,
      fullName: row.full_name,
      fromCloserId: row.assigned_closer_id,
      fromCloserName: row.from_name,
      toCloserId: next.id,
      toCloserName: next.name,
      toTelegramChatId: next.telegramChatId,
      redistributionCount: Number(updated[0]?.redistribution_count) || 0,
      hoursIdle,
    });
    await logAudit({
      userId: null,
      userEmail: 'system:lead-distribution',
      action: 'closing.lead_redistributed',
      resourceType: 'investor',
      resourceId: row.id,
      metadata: {
        fromCloserId: row.assigned_closer_id,
        fromCloserName: row.from_name,
        toCloserId: next.id,
        toCloserName: next.name,
        hoursIdle,
        rule: `${REDISTRIBUTION_AFTER_HOURS} h sans action`,
      },
    });
  }
  return out;
}
