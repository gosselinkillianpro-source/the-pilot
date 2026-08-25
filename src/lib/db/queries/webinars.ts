import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webinars } from '@/lib/db/schema';

/**
 * Lecture des webinaires pour les closers.
 *
 * Une seule requête par écran : le lendemain d'un webinaire, un closer ouvre la
 * page et doit tout avoir sous les yeux sans attendre.
 */

export type WebinarSummary = {
  id: string;
  title: string;
  scheduledAt: Date | null;
  durationMinutes: number | null;
  syncedAt: Date | null;
  registrations: number;
  live: number;
  replay: number;
  noShow: number;
  linkedToSah: number;
};

export async function listWebinars(): Promise<WebinarSummary[]> {
  const rows = await db.execute(sql`
    select
      w.id::text as id,
      w.title,
      w.scheduled_at,
      w.duration_minutes,
      w.synced_at,
      count(r.id)::int as registrations,
      count(*) filter (where r.watched_live)::int as live,
      count(*) filter (where r.watched_replay and not r.watched_live)::int as replay,
      count(*) filter (where not r.watched)::int as no_show,
      count(r.investor_id)::int as linked_to_sah
    from webinars w
    left join webinar_registrations r on r.webinar_id = w.id
    group by w.id
    order by w.scheduled_at desc nulls last
  `);

  type Raw = {
    id: string;
    title: string;
    scheduled_at: string | null;
    duration_minutes: number | null;
    synced_at: string | null;
    registrations: number;
    live: number;
    replay: number;
    no_show: number;
    linked_to_sah: number;
  };

  return (rows as unknown as Raw[]).map((r) => ({
    id: r.id,
    title: r.title,
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at) : null,
    durationMinutes: r.duration_minutes,
    syncedAt: r.synced_at ? new Date(r.synced_at) : null,
    registrations: r.registrations,
    live: r.live,
    replay: r.replay,
    noShow: r.no_show,
    linkedToSah: r.linked_to_sah,
  }));
}

export type WebinarAttendee = {
  registrationId: string;
  contactId: string | null;
  investorId: string | null;
  email: string;
  fullName: string | null;
  phone: string | null;

  watchedLive: boolean;
  watchedReplay: boolean;
  watchDurationS: number | null;
  watchDurationReplayS: number | null;

  /** Réponses au questionnaire d'inscription, telles que remontées. */
  extraFields: Record<string, string> | null;
  consentFields: Record<string, boolean> | null;
  ctaCount: number;

  // Contexte SAH quand la personne a un compte
  sahRegistrationComplete: boolean | null;
  sahOnboardingComplete: boolean | null;
  totalInvested: number | null;
  assignedCloserName: string | null;

  /** Dernier appel passé à cette personne, tous canaux d'origine confondus. */
  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  /** Prochain rappel programmé. */
  nextActionAt: Date | null;
  notes: string | null;
};

export async function getWebinar(
  id: string,
): Promise<{ webinar: WebinarSummary; attendees: WebinarAttendee[] } | null> {
  const head = await db.select().from(webinars).where(eq(webinars.id, id)).limit(1);
  if (!head[0]) return null;

  const rows = await db.execute(sql`
    select
      r.id::text as registration_id,
      r.rdv_contact_id::text as contact_id,
      r.investor_id::text as investor_id,
      r.email,
      coalesce(nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''), c.full_name) as full_name,
      coalesce(r.phone, c.phone, i.phone) as phone,
      r.watched_live,
      r.watched_replay,
      r.watch_duration_s,
      r.watch_duration_replay_s,
      r.extra_fields,
      r.consent_fields,
      coalesce(jsonb_array_length(
        case when jsonb_typeof(r.calls_to_action) = 'array' then r.calls_to_action else '[]'::jsonb end
      ), 0)::int as cta_count,
      i.registration_complete,
      i.onboarding_complete,
      (select coalesce(sum(s.amount), 0) from subscriptions s
        where s.investor_id = i.id and s.status <> 'cancelled')::float as total_invested,
      u.full_name as assigned_closer_name,
      lc.created_at as last_call_at,
      lc.outcome as last_call_outcome,
      na.due_at as next_action_at,
      c.notes
    from webinar_registrations r
    left join rdv_contacts c on c.id = r.rdv_contact_id
    left join investors i on i.id = r.investor_id
    left join users u on u.id = i.assigned_closer_id
    left join lateral (
      select created_at, outcome from interactions ix
      where ix.type in ('call_outbound', 'call_inbound')
        and (ix.investor_id = r.investor_id or ix.rdv_contact_id = r.rdv_contact_id)
      order by created_at desc limit 1
    ) lc on true
    left join lateral (
      select due_at from closer_tasks ct
      where ct.status = 'pending'
        and (ct.investor_id = r.investor_id or ct.rdv_contact_id = r.rdv_contact_id)
      order by due_at asc limit 1
    ) na on true
    where r.webinar_id = ${id}
  `);

  type Raw = Record<string, unknown>;
  const attendees: WebinarAttendee[] = (rows as unknown as Raw[]).map((r) => ({
    registrationId: String(r.registration_id),
    contactId: r.contact_id ? String(r.contact_id) : null,
    investorId: r.investor_id ? String(r.investor_id) : null,
    email: String(r.email),
    fullName: r.full_name ? String(r.full_name) : null,
    phone: r.phone ? String(r.phone) : null,
    watchedLive: r.watched_live === true,
    watchedReplay: r.watched_replay === true,
    watchDurationS: r.watch_duration_s != null ? Number(r.watch_duration_s) : null,
    watchDurationReplayS:
      r.watch_duration_replay_s != null ? Number(r.watch_duration_replay_s) : null,
    extraFields: (r.extra_fields as Record<string, string> | null) ?? null,
    consentFields: (r.consent_fields as Record<string, boolean> | null) ?? null,
    ctaCount: Number(r.cta_count) || 0,
    sahRegistrationComplete:
      r.registration_complete == null ? null : r.registration_complete === true,
    sahOnboardingComplete: r.onboarding_complete == null ? null : r.onboarding_complete === true,
    totalInvested: r.total_invested != null ? Number(r.total_invested) : null,
    assignedCloserName: r.assigned_closer_name ? String(r.assigned_closer_name) : null,
    lastCallAt: r.last_call_at ? new Date(String(r.last_call_at)) : null,
    lastCallOutcome: r.last_call_outcome ? String(r.last_call_outcome) : null,
    nextActionAt: r.next_action_at ? new Date(String(r.next_action_at)) : null,
    notes: r.notes ? String(r.notes) : null,
  }));

  const h = head[0];
  const webinar: WebinarSummary = {
    id: h.id,
    title: h.title,
    scheduledAt: h.scheduledAt,
    durationMinutes: h.durationMinutes,
    syncedAt: h.syncedAt,
    registrations: attendees.length,
    live: attendees.filter((a) => a.watchedLive).length,
    replay: attendees.filter((a) => a.watchedReplay && !a.watchedLive).length,
    noShow: attendees.filter((a) => !a.watchedLive && !a.watchedReplay).length,
    linkedToSah: attendees.filter((a) => a.investorId).length,
  };

  return { webinar, attendees };
}
