import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  advanceStage,
  isWebinarStage,
  stageAfterCall,
  type WebinarStage,
} from '@/lib/webinars/pipeline';

/**
 * Lecture du tableau de suivi des inscrits webinaire.
 *
 * Une carte par PERSONNE (fiche contact), pas par inscription : quelqu'un qui a
 * suivi deux webinaires n'apparaît qu'une fois, rattaché au dernier live auquel
 * il s'est inscrit. Sinon le closer verrait deux cartes pour un seul appel à
 * passer.
 */

export type PipelineCard = {
  contactId: string;
  investorId: string | null;
  fullName: string;
  email: string;
  phone: string | null;

  stage: WebinarStage;
  enteredAt: Date | null;
  stageUpdatedAt: Date | null;
  ownerUserId: string | null;
  ownerName: string | null;

  /** Dernier webinaire auquel la personne s'est inscrite. */
  webinarId: string | null;
  webinarTitle: string | null;
  webinarAt: Date | null;
  watchedLive: boolean;
  /** Capacité d'investissement déclarée au formulaire, telle quelle. */
  capacityRaw: string | null;

  /** Contexte SAH, quand la personne a un compte. */
  onboardingComplete: boolean | null;
  /** Souscrit depuis le webinaire d'origine — le signal « à passer en A investi ». */
  investedSince: number;

  lastCallAt: Date | null;
  lastCallOutcome: string | null;
  /** Prochain rappel programmé, s'il existe. */
  nextActionAt: Date | null;
  notes: string | null;
};

export type PipelineWebinarFilter = {
  id: string;
  title: string;
  scheduledAt: Date | null;
  cards: number;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Toutes les cartes du tableau.
 *
 * Le filtre par webinaire s'applique au DERNIER webinaire suivi : c'est celui
 * qui a motivé l'appel, donc celui sous lequel le closer cherche sa carte.
 */
/**
 * Source des fiches suivies : inscrits webinaire ou leads issus d'un RDV.
 * Le tableau, les colonnes et les gestes sont les mêmes — seule la population
 * change, d'où un paramètre plutôt qu'un second écran presque identique.
 */
export type ContactSource = 'webinar' | 'calendly';

export async function listPipelineCards(
  webinarId?: string,
  source: ContactSource = 'webinar',
): Promise<PipelineCard[]> {
  const rows = await db.execute(sql`
    select
      c.id::text as contact_id,
      c.investor_id::text as investor_id,
      coalesce(nullif(trim(c.full_name), ''), c.calendly_email) as full_name,
      c.calendly_email as email,
      coalesce(c.phone, i.phone) as phone,
      c.pipeline_stage,
      c.pipeline_entered_at,
      c.pipeline_stage_updated_at,
      c.owner_user_id::text as owner_user_id,
      ou.full_name as owner_name,
      c.notes,
      reg.webinar_id::text as webinar_id,
      reg.title as webinar_title,
      reg.scheduled_at as webinar_at,
      coalesce(reg.watched_live, false) as watched_live,
      reg.extra_fields,
      i.onboarding_complete,
      -- Ce que la personne a souscrit depuis le webinaire qui l'a amenée :
      -- c'est ce montant qui doit déclencher le passage en « A investi ».
      coalesce((
        select sum(s.amount) from subscriptions s
        where s.investor_id = i.id and s.status <> 'cancelled'
          and reg.scheduled_at is not null
          and coalesce(s.signed_at, s.paid_at, s.created_at) > reg.scheduled_at
      ), 0)::float as invested_since,
      lc.created_at as last_call_at,
      lc.outcome as last_call_outcome,
      na.due_at as next_action_at
    from rdv_contacts c
    left join users ou on ou.id = c.owner_user_id
    left join investors i on i.id = c.investor_id
    -- Dernier webinaire suivi : celui qui donne le contexte de l'appel.
    left join lateral (
      select r.webinar_id, r.watched_live, r.extra_fields, w.title, w.scheduled_at
      from webinar_registrations r
      join webinars w on w.id = r.webinar_id
      where r.rdv_contact_id = c.id
      order by w.scheduled_at desc nulls last
      limit 1
    ) reg on true
    left join lateral (
      select ix.created_at, ix.outcome from interactions ix
      where ix.type in ('call_outbound', 'call_inbound')
        and (ix.rdv_contact_id = c.id or (c.investor_id is not null and ix.investor_id = c.investor_id))
      order by ix.created_at desc limit 1
    ) lc on true
    left join lateral (
      select ct.due_at from closer_tasks ct
      where ct.status = 'pending'
        and (ct.rdv_contact_id = c.id or (c.investor_id is not null and ct.investor_id = c.investor_id))
      order by ct.due_at asc limit 1
    ) na on true
    where c.source = ${source}
      and c.pipeline_stage is not null
      ${webinarId ? sql`and reg.webinar_id = ${webinarId}` : sql``}
    order by c.pipeline_stage_updated_at desc nulls last
  `);

  type Raw = Record<string, unknown>;
  const cards: PipelineCard[] = [];
  for (const r of rows as unknown as Raw[]) {
    const stage = String(r.pipeline_stage);
    // Une colonne inconnue ne doit pas faire disparaître la carte en silence :
    // l'enum vient de la base, ce cas signale une migration incomplète.
    if (!isWebinarStage(stage)) continue;
    const extra = (r.extra_fields as Record<string, string> | null) ?? null;
    cards.push({
      contactId: String(r.contact_id),
      investorId: r.investor_id ? String(r.investor_id) : null,
      fullName: String(r.full_name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      stage,
      enteredAt: toDate(r.pipeline_entered_at),
      stageUpdatedAt: toDate(r.pipeline_stage_updated_at),
      ownerUserId: r.owner_user_id ? String(r.owner_user_id) : null,
      ownerName: r.owner_name ? String(r.owner_name) : null,
      webinarId: r.webinar_id ? String(r.webinar_id) : null,
      webinarTitle: r.webinar_title ? String(r.webinar_title) : null,
      webinarAt: toDate(r.webinar_at),
      watchedLive: r.watched_live === true,
      capacityRaw: extra?.["Capacité d'inscription"] ?? null,
      onboardingComplete: r.onboarding_complete == null ? null : r.onboarding_complete === true,
      investedSince: Number(r.invested_since) || 0,
      lastCallAt: toDate(r.last_call_at),
      lastCallOutcome: r.last_call_outcome ? String(r.last_call_outcome) : null,
      nextActionAt: toDate(r.next_action_at),
      notes: r.notes ? String(r.notes) : null,
    });
  }
  return cards;
}

/** Webinaires proposés en filtre, avec le nombre de cartes de chacun. */
export async function listPipelineWebinars(): Promise<PipelineWebinarFilter[]> {
  const rows = await db.execute(sql`
    select w.id::text as id, w.title, w.scheduled_at,
      count(distinct c.id)::int as cards
    from webinars w
    left join webinar_registrations r on r.webinar_id = w.id
    left join rdv_contacts c on c.id = r.rdv_contact_id and c.pipeline_stage is not null
    group by w.id
    order by w.scheduled_at desc nulls last
  `);
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    scheduledAt: toDate(r.scheduled_at),
    cards: Number(r.cards) || 0,
  }));
}

/* ============================================================
   ÉCRITURES — la colonne d'une carte
   ============================================================ */

/**
 * Avancement automatique déclenché par une action du closer (prise en charge,
 * appel enregistré).
 *
 * La règle d'avancement (`advanceStage`) décide seule s'il y a lieu de bouger :
 * un automatisme ne fait jamais reculer une carte, et ne touche pas une carte
 * déjà classée « A investi » ou « Perdu ». Retourne la colonne écrite, ou null
 * si rien n'a bougé.
 */
export async function progressStage(
  contactId: string,
  target: WebinarStage,
): Promise<WebinarStage | null> {
  return writeStage(contactId, (current) => advanceStage(current, target));
}

/**
 * Avancement après un appel enregistré.
 *
 * Passe par `stageAfterCall`, qui connaît les résultats d'appel fermant la
 * ligne (profil incompatible, mauvais numéro) — et la colonne courante doit
 * être lue AVANT de décider : c'est elle qui protège une personne déjà classée
 * « A investi » d'être rangée dans « Perdu » par un appel malheureux.
 */
export async function progressStageAfterCall(
  contactId: string,
  outcome: string,
): Promise<WebinarStage | null> {
  return writeStage(contactId, (current) => stageAfterCall(current, outcome));
}

/** Lit la colonne courante, demande la suivante à la règle, écrit si besoin. */
async function writeStage(
  contactId: string,
  decide: (current: WebinarStage | null) => WebinarStage | null,
): Promise<WebinarStage | null> {
  const rows = await db.execute(sql`
    select pipeline_stage from rdv_contacts where id = ${contactId} limit 1
  `);
  const row = (rows as unknown as { pipeline_stage: string | null }[])[0];
  if (!row) return null;

  const raw = row.pipeline_stage;
  const current = raw && isWebinarStage(raw) ? raw : null;
  const next = decide(current);
  if (!next) return null;

  await db.execute(sql`
    update rdv_contacts
    set pipeline_stage = ${next}::contact_stage,
        pipeline_stage_updated_at = now(),
        pipeline_entered_at = coalesce(pipeline_entered_at, now()),
        updated_at = now()
    where id = ${contactId}
  `);
  return next;
}

/**
 * Déplacement à la main, depuis le tableau : il fait autorité.
 *
 * Un closer doit pouvoir corriger une carte mal classée, y compris en la
 * ramenant en arrière — c'est lui qui a eu la personne au téléphone.
 */
export async function setStage(contactId: string, stage: WebinarStage): Promise<void> {
  await db.execute(sql`
    update rdv_contacts
    set pipeline_stage = ${stage}::contact_stage,
        pipeline_stage_updated_at = now(),
        pipeline_entered_at = coalesce(pipeline_entered_at, now()),
        updated_at = now()
    where id = ${contactId}
  `);
}

/**
 * Fiche contact webinaire d'un investisseur SAH.
 *
 * Le tableau de suivi vit sur `rdv_contacts`, mais l'écran d'un webinaire cible
 * un inscrit relié par son `investor_id`. Sans ce pont, tout ce qu'un closer
 * fait sur une personne AYANT un compte SAH — la majorité des cas — ne créerait
 * aucune carte : le tableau resterait vide alors que le travail est fait.
 */
export async function contactIdForInvestor(
  investorId: string | null | undefined,
): Promise<string | null> {
  if (!investorId) return null;
  const rows = await db.execute(sql`
    select id::text as id from rdv_contacts
    where investor_id = ${investorId} and source = 'webinar'
    order by created_at desc limit 1
  `);
  const row = (rows as unknown as { id: string }[])[0];
  return row ? row.id : null;
}
