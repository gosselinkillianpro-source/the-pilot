import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

/**
 * Vue superviseur (admin) : présence des closers + leur dernière action + activité
 * récente de l'équipe. Construite sur les actions réellement enregistrées
 * (appels/qualifications dans `interactions`, actions planifiées dans `closer_tasks`,
 * générations IA dans `investor_assets`). La présence vient de `users.last_seen_at`.
 */

const ONLINE_WINDOW_MIN = 5;

export type CloserStatus = {
  id: string;
  name: string | null;
  role: string;
  lastSeenAt: Date | null;
  online: boolean;
  lastActionLabel: string | null;
  lastActionAt: Date | null;
  callsToday: number;
  actionsToday: number;
};

export type ActivityEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  label: string;
  investorId: string | null;
  investorName: string | null;
  at: Date;
};

export type TeamOverview = { closers: CloserStatus[]; feed: ActivityEvent[] };

const OUTCOME: Record<string, string> = {
  reached: 'Joint',
  no_answer: 'Pas de réponse',
  voicemail: 'Répondeur',
  wrong_number: 'Mauvais numéro',
  callback_scheduled: 'Rappel programmé',
};
const ACTION: Record<string, string> = {
  callback: 'rappel',
  email: 'email',
  message: 'message',
  todo: 'tâche',
};

function labelFor(kind: string, detail: string | null): string {
  if (kind === 'call_outbound' || kind === 'call_inbound') {
    if (!detail) return 'Appel (à qualifier)';
    return `Appel — ${OUTCOME[detail] ?? detail}`;
  }
  if (kind === 'plan') return `A planifié un ${ACTION[detail ?? ''] ?? 'élément'}`;
  if (kind === 'asset')
    return detail === 'email_proposal' ? 'A généré un email' : 'A généré un script';
  return kind;
}

// Union des actions traçables (acteur + type + détail + investisseur + date).
const EVENTS = sql`
  select ('call:' || ix.id::text) as id, ix.user_id as actor_id,
         ix.type::text as kind, ix.outcome::text as detail,
         ix.investor_id as investor_id, ix.created_at as at
  from interactions ix
  where ix.type in ('call_outbound', 'call_inbound') and ix.user_id is not null
  union all
  select ('task:' || ct.id::text), ct.created_by,
         'plan'::text, ct.type,
         ct.investor_id, ct.created_at
  from closer_tasks ct where ct.created_by is not null
  union all
  select ('asset:' || ia.id::text), ia.created_by,
         'asset'::text, ia.kind::text,
         ia.investor_id, ia.created_at
  from investor_assets ia where ia.created_by is not null
`;

type FeedRaw = {
  id: string;
  actor_id: string | null;
  kind: string;
  detail: string | null;
  investor_id: string | null;
  at: string | Date;
  actor_name: string | null;
  investor_name: string | null;
};
type CountRaw = { actor_id: string | null; actions: number; calls: number };

export async function getTeamOverview(): Promise<TeamOverview> {
  const now = Date.now();

  const closerRows = await db
    .select({
      id: users.id,
      name: users.fullName,
      role: users.role,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(inArray(users.role, ['closer', 'closer_junior']));

  const feedRaw = (await db.execute(sql`
    select e.id, e.actor_id::text as actor_id, e.kind, e.detail,
           e.investor_id::text as investor_id, e.at,
           u.full_name as actor_name, i.full_name as investor_name
    from (${EVENTS}) e
    left join users u on u.id = e.actor_id
    left join investors i on i.id = e.investor_id
    order by e.at desc
    limit 60
  `)) as unknown as FeedRaw[];

  const countsRaw = (await db.execute(sql`
    select e.actor_id::text as actor_id,
           count(*)::int as actions,
           count(*) filter (where e.kind in ('call_outbound', 'call_inbound'))::int as calls
    from (${EVENTS}) e
    where e.at >= date_trunc('day', now())
    group by e.actor_id
  `)) as unknown as CountRaw[];

  const feed: ActivityEvent[] = feedRaw.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    label: labelFor(r.kind, r.detail),
    investorId: r.investor_id,
    investorName: r.investor_name,
    at: new Date(r.at),
  }));

  const countsByActor = new Map(countsRaw.map((c) => [c.actor_id, c]));
  const lastByActor = new Map<string, ActivityEvent>();
  for (const ev of feed) {
    if (ev.actorId && !lastByActor.has(ev.actorId)) lastByActor.set(ev.actorId, ev);
  }

  const closers: CloserStatus[] = closerRows
    .map((c) => {
      const last = lastByActor.get(c.id) ?? null;
      const counts = countsByActor.get(c.id);
      const online =
        c.lastSeenAt != null && now - new Date(c.lastSeenAt).getTime() < ONLINE_WINDOW_MIN * 60_000;
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        lastSeenAt: c.lastSeenAt,
        online,
        lastActionLabel: last?.label ?? null,
        lastActionAt: last?.at ?? null,
        callsToday: counts?.calls ? Number(counts.calls) : 0,
        actionsToday: counts?.actions ? Number(counts.actions) : 0,
      };
    })
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const al = a.lastSeenAt?.getTime() ?? 0;
      const bl = b.lastSeenAt?.getTime() ?? 0;
      return bl - al;
    });

  return { closers, feed };
}
