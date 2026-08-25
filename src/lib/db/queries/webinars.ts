import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webinars } from '@/lib/db/schema';
import { internalAccountReason, isInternalAccount } from '@/lib/sah/internal-accounts';
import {
  type AttributionInvestor,
  type AttributionRegistration,
  type AttributionResult,
  type AttributionSubscription,
  type AttributionWebinar,
  attributeSubscriptions,
  type RegistrationStatus,
  registrationStatus,
} from '@/lib/webinars/attribution';

/**
 * Lecture des webinaires pour les closers.
 *
 * Une seule requête par écran : le lendemain d'un webinaire, un closer ouvre la
 * page et doit tout avoir sous les yeux sans attendre.
 *
 * La RÈGLE d'attribution, elle, ne vit pas ici : elle est dans
 * `src/lib/webinars/attribution.ts`, module pur couvert par des tests. Cette
 * couche ne fait que charger les faits bruts et servir le résultat — c'est ce
 * qui garantit que la liste et la page de détail affichent le même chiffre.
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
  /**
   * Collecte réellement attribuable à ce webinaire.
   *
   * Recrue (entrée sur la plateforme par ce webinaire) : tout ce qu'elle
   * souscrit, pour toujours. Membre déjà présent : sa première souscription
   * après le live, et une seule. Voir `webinars/attribution.ts`.
   */
  attributedRevenue: number;
  attributedInvestors: number;
  /** Part de la collecte venue de gens que ce webinaire a fait entrer sur SAH. */
  recruitRevenue: number;
  /** Nombre d'inscrits que ce webinaire a fait entrer sur la plateforme. */
  recruits: number;
};

/** Postgres renvoie les timestamps tantôt en Date, tantôt en chaîne selon le driver. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

type LoadedAttribution = AttributionResult & {
  /** Investisseurs écartés du calcul parce qu'ils appartiennent à la maison. */
  internalInvestorIds: Set<string>;
};

/**
 * Charge les faits bruts nécessaires à l'attribution et applique la règle.
 *
 * Le périmètre est borné aux investisseurs inscrits à au moins un webinaire —
 * quelques dizaines aujourd'hui, quelques centaines à terme : on peut donc
 * calculer en mémoire, avec une règle testée, plutôt qu'en SQL dupliqué entre
 * deux écrans.
 */
async function loadAttribution(): Promise<LoadedAttribution> {
  const [webRows, regRows, invRows, subRows] = await Promise.all([
    db.execute(sql`
      select id::text as id, scheduled_at
      from webinars
      where scheduled_at is not null
    `),
    db.execute(sql`
      select r.webinar_id::text as webinar_id, r.investor_id::text as investor_id, r.registered_at
      from webinar_registrations r
      join webinars w on w.id = r.webinar_id
      where r.investor_id is not null and w.scheduled_at is not null
    `),
    db.execute(sql`
      select i.id::text as id, i.sah_id, i.email, i.sah_created_at
      from investors i
      where exists (select 1 from webinar_registrations r where r.investor_id = i.id)
    `),
    db.execute(sql`
      select s.id::text as id, s.investor_id::text as investor_id, s.amount::float as amount,
             coalesce(s.signed_at, s.paid_at, s.created_at) as signed_ref
      from subscriptions s
      where s.status <> 'cancelled'
        and exists (select 1 from webinar_registrations r where r.investor_id = s.investor_id)
    `),
  ]);

  const internalInvestorIds = new Set<string>();
  const investors: AttributionInvestor[] = [];
  for (const raw of invRows as unknown as Record<string, unknown>[]) {
    const id = String(raw.id);
    const sahId = raw.sah_id == null ? null : String(raw.sah_id);
    const email = raw.email == null ? null : String(raw.email);
    if (isInternalAccount(sahId, email)) {
      // Le fondateur s'inscrit à son propre webinaire : ses souscriptions ne
      // mesurent rien. On l'écarte du calcul, pas de l'écran.
      internalInvestorIds.add(id);
      continue;
    }
    investors.push({ id, sahCreatedAt: toDate(raw.sah_created_at) });
  }

  const webinarList: AttributionWebinar[] = [];
  for (const raw of webRows as unknown as Record<string, unknown>[]) {
    const scheduledAt = toDate(raw.scheduled_at);
    if (scheduledAt) webinarList.push({ id: String(raw.id), scheduledAt });
  }

  const registrations: AttributionRegistration[] = (regRows as unknown as Record<string, unknown>[])
    .map((raw) => ({
      webinarId: String(raw.webinar_id),
      investorId: String(raw.investor_id),
      registeredAt: toDate(raw.registered_at),
    }))
    .filter((r) => !internalInvestorIds.has(r.investorId));

  const subscriptions: AttributionSubscription[] = [];
  for (const raw of subRows as unknown as Record<string, unknown>[]) {
    const investorId = String(raw.investor_id);
    if (internalInvestorIds.has(investorId)) continue;
    const signedRef = toDate(raw.signed_ref);
    // Sans aucune date exploitable, impossible de situer la souscription par
    // rapport au live : on ne devine pas, on l'écarte.
    if (!signedRef) continue;
    subscriptions.push({
      id: String(raw.id),
      investorId,
      amount: Number(raw.amount) || 0,
      signedRef,
    });
  }

  const result = attributeSubscriptions({
    webinars: webinarList,
    registrations,
    investors,
    subscriptions,
  });
  return { ...result, internalInvestorIds };
}

/** Agrège les attributions par webinaire. */
function summarize(result: AttributionResult) {
  const byWebinar = new Map<
    string,
    { revenue: number; investors: Set<string>; recruitRevenue: number; recruits: Set<string> }
  >();
  const bucket = (webinarId: string) => {
    const existing = byWebinar.get(webinarId);
    if (existing) return existing;
    const created = {
      revenue: 0,
      investors: new Set<string>(),
      recruitRevenue: 0,
      recruits: new Set<string>(),
    };
    byWebinar.set(webinarId, created);
    return created;
  };

  for (const a of result.attributions) {
    const b = bucket(a.webinarId);
    b.revenue += a.amount;
    b.investors.add(a.investorId);
    if (a.reason === 'recruit') b.recruitRevenue += a.amount;
  }
  // Une recrue compte même si elle n'a encore rien souscrit : c'est le nombre
  // de comptes SAH que le webinaire a fait naître.
  for (const [investorId, webinarId] of result.recruiterByInvestor) {
    bucket(webinarId).recruits.add(investorId);
  }
  return byWebinar;
}

export async function listWebinars(): Promise<WebinarSummary[]> {
  const [rows, attribution] = await Promise.all([
    db.execute(sql`
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
    `),
    loadAttribution(),
  ]);
  const byWebinar = summarize(attribution);

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

  return (rows as unknown as Raw[]).map((r) => {
    const agg = byWebinar.get(r.id);
    return {
      id: r.id,
      title: r.title,
      scheduledAt: toDate(r.scheduled_at),
      durationMinutes: r.duration_minutes,
      syncedAt: toDate(r.synced_at),
      registrations: r.registrations,
      live: r.live,
      replay: r.replay,
      noShow: r.no_show,
      linkedToSah: r.linked_to_sah,
      attributedRevenue: agg?.revenue ?? 0,
      attributedInvestors: agg?.investors.size ?? 0,
      recruitRevenue: agg?.recruitRevenue ?? 0,
      recruits: agg?.recruits.size ?? 0,
    };
  });
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
  /** Tout ce que cette personne a souscrit depuis le webinaire — informatif. */
  investedSinceWebinar: number;
  /** Ce qui est réellement porté au crédit de CE webinaire, selon la règle. */
  attributedAmount: number;
  /** Recrue de ce webinaire, d'un autre, ou membre déjà présent. Null sans compte SAH. */
  attributionStatus: RegistrationStatus | null;
  /** Compte de la maison (fondateur, staff, service) : exclu des chiffres d'acquisition. */
  internalAccountReason: string | null;
  assignedCloserName: string | null;

  /** Closer qui a pris la fiche en charge (« Je prends »). */
  ownerUserId: string | null;
  ownerName: string | null;
  /** Colonne du tableau de suivi, quand la personne y est déjà. */
  pipelineStage: string | null;

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

  // Sans date de webinaire, aucune attribution n'a de sens : on ne peut pas
  // savoir ce qui a été souscrit « après ». Une date impossible à dépasser
  // donne alors une collecte nulle, plutôt qu'un chiffre inventé.
  //
  // ⚠️ En chaîne ISO, pas en objet Date : le pilote Postgres refuse un Date
  // comme paramètre de requête brute (« Received an instance of Date »).
  const webinarDate = (head[0].scheduledAt ?? new Date('9999-01-01')).toISOString();

  const [rows, attribution] = await Promise.all([
    db.execute(sql`
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
        i.sah_id,
        i.email as investor_email,
        i.registration_complete,
        i.onboarding_complete,
        (select coalesce(sum(s.amount), 0) from subscriptions s
          where s.investor_id = i.id and s.status <> 'cancelled')::float as total_invested,
        -- Tout ce qui a été souscrit depuis le webinaire, sans règle
        -- d'attribution : sert à montrer l'écart avec ce qui lui est crédité.
        (select coalesce(sum(s.amount), 0) from subscriptions s
          where s.investor_id = i.id and s.status <> 'cancelled'
            and coalesce(s.signed_at, s.paid_at, s.created_at) > ${webinarDate}
        )::float as invested_since,
        u.full_name as assigned_closer_name,
        c.owner_user_id::text as owner_user_id,
        ow.full_name as owner_name,
        c.pipeline_stage,
        lc.created_at as last_call_at,
        lc.outcome as last_call_outcome,
        na.due_at as next_action_at,
        c.notes
      from webinar_registrations r
      left join rdv_contacts c on c.id = r.rdv_contact_id
      left join investors i on i.id = r.investor_id
      left join users u on u.id = i.assigned_closer_id
      left join users ow on ow.id = c.owner_user_id
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
    `),
    loadAttribution(),
  ]);

  // Ce que la règle a effectivement crédité à CE webinaire, par investisseur.
  const attributedByInvestor = new Map<string, number>();
  for (const a of attribution.attributions) {
    if (a.webinarId !== id) continue;
    attributedByInvestor.set(
      a.investorId,
      (attributedByInvestor.get(a.investorId) ?? 0) + a.amount,
    );
  }

  type Raw = Record<string, unknown>;
  const attendees: WebinarAttendee[] = (rows as unknown as Raw[]).map((r) => {
    const investorId = r.investor_id ? String(r.investor_id) : null;
    const internal = investorId
      ? internalAccountReason(
          r.sah_id == null ? null : String(r.sah_id),
          r.investor_email == null ? null : String(r.investor_email),
        )
      : null;
    return {
      registrationId: String(r.registration_id),
      contactId: r.contact_id ? String(r.contact_id) : null,
      investorId,
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
      investedSinceWebinar: Number(r.invested_since) || 0,
      attributedAmount: investorId ? (attributedByInvestor.get(investorId) ?? 0) : 0,
      attributionStatus:
        investorId && !internal
          ? registrationStatus(id, attribution.recruiterByInvestor.get(investorId))
          : null,
      internalAccountReason: internal,
      assignedCloserName: r.assigned_closer_name ? String(r.assigned_closer_name) : null,
      ownerUserId: r.owner_user_id ? String(r.owner_user_id) : null,
      ownerName: r.owner_name ? String(r.owner_name) : null,
      pipelineStage: r.pipeline_stage ? String(r.pipeline_stage) : null,
      lastCallAt: toDate(r.last_call_at),
      lastCallOutcome: r.last_call_outcome ? String(r.last_call_outcome) : null,
      nextActionAt: toDate(r.next_action_at),
      notes: r.notes ? String(r.notes) : null,
    };
  });

  const h = head[0];
  const agg = summarize(attribution).get(h.id);
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
    // Mêmes chiffres que la liste : une seule règle, appliquée une seule fois.
    attributedRevenue: agg?.revenue ?? 0,
    attributedInvestors: agg?.investors.size ?? 0,
    recruitRevenue: agg?.recruitRevenue ?? 0,
    recruits: agg?.recruits.size ?? 0,
  };

  return { webinar, attendees };
}
