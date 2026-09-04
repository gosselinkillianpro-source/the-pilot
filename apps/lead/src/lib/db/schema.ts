import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * THE PILOT LEAD — schéma Postgres `lead`.
 *
 * Tout vit dans un schéma dédié, jamais dans `public` : Supabase n'expose que
 * `public` à PostgREST, donc la clé anonyme du navigateur ne peut PAS atteindre
 * ces tables, même par erreur de politique. L'application se connecte avec le
 * rôle `app_lead` (drizzle/roles.sql), sans bypass RLS : l'isolation des
 * acheteurs est garantie par la base (drizzle/policies.sql), pas par le code.
 *
 * Conventions : `id` uuid, `created_at` / `updated_at` partout, dates en UTC,
 * montants en centimes, colonnes en snake_case. Aucun champ « produit » ni
 * « partenaire recommandé » : règle de conformité (apporteur non réglementé).
 */
export const lead = pgSchema('lead');

/* ============================================================
   Enums
   ============================================================ */

/** États d'un lead — section 2 de la spec. Les états après RDV_POSÉ miroitent le dernier rendez-vous. */
export const leadStateEnum = lead.enum('lead_state', [
  'nouveau',
  'a_rappeler',
  'en_appel',
  'qualifie',
  'rdv_pose',
  'a_rappeler_plus_tard',
  'a_nourrir',
  'hors_cible',
  'injoignable',
  'honore',
  'absent',
  'reprogramme',
  'conforme',
  'non_conforme',
  'retour_accepte',
  'retour_refuse',
  'en_cours',
  'signe',
  'perdu',
]);

export const actorTypeEnum = lead.enum('actor_type', ['system', 'setter', 'buyer', 'admin']);

export const callOutcomeEnum = lead.enum('call_outcome', [
  'repondu',
  'messagerie',
  'occupe',
  'faux_numero',
]);

export const dispositionEnum = lead.enum('disposition', [
  'rdv_pose',
  'rappeler',
  'nourrir',
  'hors_cible',
  'injoignable',
]);

export const nurtureReasonEnum = lead.enum('nurture_reason', [
  'curiosite',
  'montant_sous_seuil',
  'pas_maintenant',
]);

/** Motifs « hors cible » (liste fermée). `doublon` est posé automatiquement à la réception. */
export const horsCibleReasonEnum = lead.enum('hors_cible_reason', [
  'doublon',
  'faux_numero',
  'montant_hors_criteres',
  'timing_hors_criteres',
  'hors_zone',
  'deja_client',
  'pas_interesse',
  'autre',
]);

export const nonConformityReasonEnum = lead.enum('non_conformity_reason', [
  'faux_numero',
  'montant_hors_criteres',
  'timing_hors_criteres',
  'doublon',
  'deja_client',
  'autre',
]);

export const appointmentStatusEnum = lead.enum('appointment_status', [
  'pose',
  'honore',
  'absent',
  'reprogramme',
  'annule',
]);

export const conformityEnum = lead.enum('conformity', ['conforme', 'non_conforme']);
export const validatedByEnum = lead.enum('validated_by', ['buyer', 'tacit', 'admin']);
export const outcomeEnum = lead.enum('outcome', ['en_cours', 'signe', 'perdu']);
export const returnStatusEnum = lead.enum('return_status', ['demande', 'accepte', 'refuse']);
export const packStatusEnum = lead.enum('pack_status', ['actif', 'epuise', 'clos']);
export const invoiceStatusEnum = lead.enum('invoice_status', ['brouillon', 'emise', 'payee']);
export const platformEnum = lead.enum('platform', ['meta', 'google', 'organic', 'other']);

export const calendarProviderEnum = lead.enum('calendar_provider', [
  'calendly_oauth',
  'calendly_link',
  'calcom',
  'google',
  'manual',
]);

export const userRoleEnum = lead.enum('user_role', ['admin', 'setter', 'buyer']);
export const buyerUserRoleEnum = lead.enum('buyer_user_role', ['owner', 'member']);

export const conversionEventNameEnum = lead.enum('conversion_event_name', [
  'Lead',
  'Schedule',
  'RDV_Honore',
  'RDV_Conforme',
  'Signe',
]);

export const jobStatusEnum = lead.enum('job_status', [
  'pending',
  'running',
  'done',
  'failed',
  'cancelled',
]);

export const notificationChannelEnum = lead.enum('notification_channel', [
  'sms',
  'email',
  'telegram',
]);

export const notificationStatusEnum = lead.enum('notification_status', [
  'sent',
  'failed',
  'skipped',
]);

export const nurtureExportTargetEnum = lead.enum('nurture_export_target', ['brevo', 'none']);

export const signedLinkPurposeEnum = lead.enum('signed_link_purpose', [
  'buyer_validation',
  'reschedule',
  'slot_pick',
  'reroute_consent',
]);

/* ============================================================
   Types JSON
   ============================================================ */

/** Plage horaire d'un jour de service, en heure de Paris : "09:00" → "20:00". */
export type ServiceHoursDay = { open: string; close: string };
/** Clé = jour ISO (1 = lundi … 7 = dimanche). Jour absent = fermé. */
export type ServiceHours = Partial<
  Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', ServiceHoursDay>
>;

/** Script d'appel affiché sur la fiche (texte par source, pas une donnée du lead). */
export type CallScript = {
  presentation: string;
  capacite: string;
  creneau: string;
  interdits: string[];
};

/** Critères d'un acheteur — section 4.5. Les valeurs sont celles du formulaire (tranches ordonnées). */
export type BuyerCriteria = {
  montant_min?: string;
  objectifs?: string[];
  timing_max?: string;
  impot_min?: string;
  patrimoine_min?: string;
  age?: string[];
  zones?: string[];
  exclusions?: Record<string, string[]>;
  obligatoires: string[];
};

/** Résultat des critères cochés par le setter : `oui` / `non` / null = non vérifié. */
export type CriteriaChecks = Record<string, boolean | null>;

export type CalendarConfig = {
  /** Lien public de réservation (mode `calendly_link`). */
  booking_url?: string;
  /** Durée par défaut d'un rendez-vous, minutes. */
  duration_min?: number;
};

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ============================================================
   Sources & campagnes
   ============================================================ */

export const sources = lead.table('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `mep` aujourd'hui, d'autres marques de Breach demain. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  defaultTimezone: text('default_timezone').notNull().default('Europe/Paris'),
  serviceHours: jsonb('service_hours').$type<ServiceHours>().notNull(),
  /** Secret du webhook (`X-Source-Key`). Généré à la création, rotatif. */
  webhookSecret: text('webhook_secret').notNull(),
  slaTargetMin: integer('sla_target_min').notNull().default(5),
  slaAlertMin: integer('sla_alert_min').notNull().default(10),
  nurtureExportTarget: nurtureExportTargetEnum('nurture_export_target').notNull().default('none'),
  script: jsonb('script').$type<CallScript>(),
  /** Modèle du SMS envoyé au lead reçu hors heures de service. */
  offHoursSms: text('off_hours_sms'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const campaigns = lead.table(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    platform: platformEnum('platform').notNull().default('other'),
    externalId: text('external_id'),
    /** Clé du reporting : exactement le nom du Gestionnaire, jamais normalisé. */
    name: text('name').notNull(),
    adsetName: text('adset_name').notNull().default(''),
    adName: text('ad_name').notNull().default(''),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('campaigns_source_triplet_uq').on(t.sourceId, t.name, t.adsetName, t.adName)],
);

/* ============================================================
   Utilisateurs (table propre à The Pilot Lead)
   ============================================================ */

export const users = lead.table('users', {
  /** = identifiant Supabase Auth du projet dédié. */
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: userRoleEnum('role').notNull().default('setter'),
  /** Périmètre d'un setter : une ou plusieurs sources. */
  sourceIds: jsonb('source_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Périmètre d'un acheteur : UN seul acheteur. */
  buyerId: uuid('buyer_id'),
  /** Reçoit les alertes « nouveau lead » et les escalades. */
  onDuty: boolean('on_duty').notNull().default(false),
  phoneForAlerts: text('phone_for_alerts'),
  telegramChatId: text('telegram_chat_id'),
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

/* ============================================================
   Leads
   ============================================================ */

export const leads = lead.table(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    // Identité
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    phoneE164: text('phone_e164').notNull(),
    email: text('email'),
    locale: text('locale').notNull().default('fr-FR'),
    // Réponses
    answers: jsonb('answers').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    answersVersion: text('answers_version'),
    answersCompletedAt: timestamp('answers_completed_at', { withTimezone: true, mode: 'date' }),
    /** Score calculé par le site (pondération du formulaire), informatif. */
    siteScore: integer('site_score'),
    // Consentement
    consentText: text('consent_text').notNull(),
    consentVersion: text('consent_version'),
    consentAt: timestamp('consent_at', { withTimezone: true, mode: 'date' }).notNull(),
    consentIpHash: text('consent_ip_hash'),
    consentUserAgent: text('consent_user_agent'),
    consentPartnerTransfer: boolean('consent_partner_transfer').notNull().default(true),
    // Attribution
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
    fbclid: text('fbclid'),
    fbc: text('fbc'),
    fbp: text('fbp'),
    landingUrl: text('landing_url'),
    referrer: text('referrer'),
    pagePath: text('page_path'),
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    // Temps
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Immuable après le premier clic « J'appelle ». */
    firstCallAt: timestamp('first_call_at', { withTimezone: true, mode: 'date' }),
    slaMinutesEffective: integer('sla_minutes_effective'),
    attemptsCount: integer('attempts_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
    /** « Rappeler plus tard » : date convenue avec le lead. */
    callbackAt: timestamp('callback_at', { withTimezone: true, mode: 'date' }),
    // Alertes
    alertedAt: timestamp('alerted_at', { withTimezone: true, mode: 'date' }),
    /** 0 = aucune escalade, 1 = +alert_min, 2 = +30 min. */
    slaAlertLevel: integer('sla_alert_level').notNull().default(0),
    // Statut
    state: leadStateEnum('state').notNull().default('nouveau'),
    stateChangedAt: timestamp('state_changed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    stateReason: horsCibleReasonEnum('state_reason'),
    nurtureReason: nurtureReasonEnum('nurture_reason'),
    dedupeOf: uuid('dedupe_of'),
    // Routage
    buyerId: uuid('buyer_id'),
    routedAt: timestamp('routed_at', { withTimezone: true, mode: 'date' }),
    rerouteConsentAt: timestamp('reroute_consent_at', { withTimezone: true, mode: 'date' }),
    // Divers
    idempotencyKey: text('idempotency_key').notNull(),
    rawPayload: jsonb('raw_payload').$type<unknown>(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('leads_source_idempotency_uq').on(t.sourceId, t.idempotencyKey),
    index('leads_phone_idx').on(t.phoneE164),
    index('leads_email_idx').on(t.email),
    index('leads_state_idx').on(t.state),
    index('leads_received_idx').on(t.receivedAt),
    index('leads_buyer_idx').on(t.buyerId),
  ],
);

/** Journal append-only de tout changement d'état. */
export const leadEvents = lead.table(
  'lead_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    /** Renseigné quand un admin agit « en tant que » un acheteur. */
    onBehalfOf: uuid('on_behalf_of'),
    fromState: leadStateEnum('from_state'),
    toState: leadStateEnum('to_state'),
    /** Type d'événement quand il n'y a pas de changement d'état (note, tentative…). */
    kind: text('kind').notNull().default('transition'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('lead_events_lead_idx').on(t.leadId, t.at)],
);

export const callAttempts = lead.table(
  'call_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    setterId: uuid('setter_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    outcome: callOutcomeEnum('outcome'),
    notes: text('notes'),
    /** Seulement si consentement à l'enregistrement (hors périmètre v0). */
    recordingUrl: text('recording_url'),
    ...timestamps,
  },
  (t) => [index('call_attempts_lead_idx').on(t.leadId)],
);

export const qualifications = lead.table('qualifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .unique()
    .references(() => leads.id),
  setterId: uuid('setter_id'),
  criteria: jsonb('criteria').$type<CriteriaChecks>().notNull().default(sql`'{}'::jsonb`),
  score: integer('score').notNull().default(0),
  disposition: dispositionEnum('disposition'),
  dispositionReason: text('disposition_reason'),
  notes: text('notes'),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

/* ============================================================
   Acheteurs
   ============================================================ */

export const buyers = lead.table('buyers', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  /** Obligatoire : un acheteur est toujours un partenaire immatriculé ORIAS. */
  oriasNumber: text('orias_number').notNull(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  criteria: jsonb('criteria')
    .$type<BuyerCriteria>()
    .notNull()
    .default(sql`'{"obligatoires":[]}'::jsonb`),
  dailyCap: integer('daily_cap'),
  weeklyCap: integer('weekly_cap'),
  /** 1 = servi en premier. */
  priority: integer('priority').notNull().default(1),
  exclusive: boolean('exclusive').notNull().default(true),
  pricePerRdvCents: integer('price_per_rdv_cents').notNull().default(0),
  currency: text('currency').notNull().default('EUR'),
  /** Valeur estimée d'une signature, envoyée à Meta sur l'événement Signe. */
  signedValueCents: integer('signed_value_cents'),
  validationDelayHours: integer('validation_delay_hours').notNull().default(48),
  /** false pendant le premier pack : sans réponse, l'admin est alerté. */
  tacitValidationEnabled: boolean('tacit_validation_enabled').notNull().default(false),
  calendarProvider: calendarProviderEnum('calendar_provider').notNull().default('manual'),
  calendarConfig: jsonb('calendar_config').$type<CalendarConfig>(),
  timezone: text('timezone').notNull().default('Europe/Paris'),
  active: boolean('active').notNull().default(true),
  pausedUntil: timestamp('paused_until', { withTimezone: true, mode: 'date' }),
  ...timestamps,
});

export const buyerUsers = lead.table(
  'buyer_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id),
    /** Compte lead.users correspondant (créé à la première connexion par lien magique). */
    userId: uuid('user_id'),
    email: text('email').notNull(),
    role: buyerUserRoleEnum('role').notNull().default('owner'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('buyer_users_buyer_email_uq').on(t.buyerId, t.email)],
);

/** Connexion Calendly OAuth d'un acheteur (jetons chiffrés au niveau applicatif). */
export const calendlyConnections = lead.table('calendly_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: uuid('buyer_id')
    .notNull()
    .unique()
    .references(() => buyers.id),
  calendlyUserUri: text('calendly_user_uri').notNull(),
  organizationUri: text('organization_uri'),
  schedulingUrl: text('scheduling_url'),
  eventTypeUri: text('event_type_uri'),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  webhookUri: text('webhook_uri'),
  ...timestamps,
});

/* ============================================================
   Rendez-vous, packs, factures
   ============================================================ */

export const appointments = lead.table(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMin: integer('duration_min').notNull().default(30),
    calendarEventId: text('calendar_event_id'),
    bookingUrl: text('booking_url'),
    status: appointmentStatusEnum('status').notNull().default('pose'),
    conformity: conformityEnum('conformity'),
    nonConformityReason: nonConformityReasonEnum('non_conformity_reason'),
    validatedAt: timestamp('validated_at', { withTimezone: true, mode: 'date' }),
    validatedBy: validatedByEnum('validated_by'),
    validationDueAt: timestamp('validation_due_at', { withTimezone: true, mode: 'date' }).notNull(),
    outcome: outcomeEnum('outcome'),
    outcomeAt: timestamp('outcome_at', { withTimezone: true, mode: 'date' }),
    returnStatus: returnStatusEnum('return_status'),
    returnComment: text('return_comment'),
    returnDecidedAt: timestamp('return_decided_at', { withTimezone: true, mode: 'date' }),
    replacementOf: uuid('replacement_of'),
    /** Calculé : honoré + conforme + retour non accepté. */
    billable: boolean('billable').notNull().default(false),
    packId: uuid('pack_id'),
    /** Fiche transmise à l'acheteur (réponses + notes du setter), figée à la prise de RDV. */
    setterNotes: text('setter_notes'),
    buyerNotes: text('buyer_notes'),
    reminderJ1SentAt: timestamp('reminder_j1_sent_at', { withTimezone: true, mode: 'date' }),
    reminderH2SentAt: timestamp('reminder_h2_sent_at', { withTimezone: true, mode: 'date' }),
    validationReminder24SentAt: timestamp('validation_reminder_24_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    validationReminder44SentAt: timestamp('validation_reminder_44_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    ...timestamps,
  },
  (t) => [
    index('appointments_buyer_idx').on(t.buyerId, t.scheduledAt),
    index('appointments_lead_idx').on(t.leadId),
    index('appointments_validation_due_idx').on(t.validationDueAt),
  ],
);

export const packs = lead.table('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => buyers.id),
  size: integer('size').notNull().default(10),
  priceCentsPerRdv: integer('price_cents_per_rdv').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  prepaid: boolean('prepaid').notNull().default(false),
  paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
  remaining: integer('remaining').notNull(),
  lowThreshold: integer('low_threshold').notNull().default(2),
  lowAlertSentAt: timestamp('low_alert_sent_at', { withTimezone: true, mode: 'date' }),
  status: packStatusEnum('status').notNull().default('actif'),
  /** Pack offert (pilote) : même mécanique, à 0 €. */
  isPilot: boolean('is_pilot').notNull().default(false),
  ...timestamps,
});

export const invoices = lead.table('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: uuid('buyer_id')
    .notNull()
    .references(() => buyers.id),
  periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }).notNull(),
  totalCents: integer('total_cents').notNull().default(0),
  status: invoiceStatusEnum('status').notNull().default('brouillon'),
  externalRef: text('external_ref'),
  ...timestamps,
});

export const invoiceLines = lead.table('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id),
  /** Dénormalisé pour la politique RLS acheteur. */
  buyerId: uuid('buyer_id').notNull(),
  appointmentId: uuid('appointment_id'),
  label: text('label').notNull(),
  amountCents: integer('amount_cents').notNull().default(0),
  ...timestamps,
});

/* ============================================================
   Retour vers les plateformes
   ============================================================ */

export const conversionEvents = lead.table(
  'conversion_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    appointmentId: uuid('appointment_id'),
    platform: platformEnum('platform').notNull().default('meta'),
    eventName: conversionEventNameEnum('event_name').notNull(),
    /** Unique : déduplication côté Meta (event_id = lead_id pour Lead). */
    eventId: text('event_id').notNull().unique(),
    eventTime: timestamp('event_time', { withTimezone: true, mode: 'date' }).notNull(),
    payloadHash: text('payload_hash'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    responseStatus: integer('response_status'),
    error: text('error'),
    /** Envoyé en temps réel (CAPI) ou par export hors ligne hebdomadaire. */
    deliveredVia: text('delivered_via'),
    ...timestamps,
  },
  (t) => [index('conversion_events_lead_idx').on(t.leadId)],
);

/* ============================================================
   Reporting (tableau du lundi) et réglages
   ============================================================ */

/** Dépense par campagne et semaine : saisie admin (v0) ou import Meta (v1). */
export const campaignSpend = lead.table(
  'campaign_spend',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    /** Lundi de la semaine (date UTC à minuit). */
    weekMonday: timestamp('week_monday', { withTimezone: true, mode: 'date' }).notNull(),
    spendCents: integer('spend_cents').notNull().default(0),
    origin: text('origin').notNull().default('manual'),
    ...timestamps,
  },
  (t) => [uniqueIndex('campaign_spend_week_uq').on(t.sourceId, t.campaignId, t.weekMonday)],
);

export const weeklyMetrics = lead.table(
  'weekly_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    weekMonday: timestamp('week_monday', { withTimezone: true, mode: 'date' }).notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    spendCents: integer('spend_cents').notNull().default(0),
    leads: integer('leads').notNull().default(0),
    cplCents: integer('cpl_cents'),
    rdvPoses: integer('rdv_poses').notNull().default(0),
    tauxPrise: integer('taux_prise'),
    honores: integer('honores').notNull().default(0),
    tauxPresence: integer('taux_presence'),
    conformes: integer('conformes').notNull().default(0),
    tauxConformite: integer('taux_conformite'),
    coutParRdvConformeCents: integer('cout_par_rdv_conforme_cents'),
    signes: integer('signes').notNull().default(0),
    delaiMoyenMin: integer('delai_moyen_min'),
    alerts: jsonb('alerts').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('weekly_metrics_uq').on(t.sourceId, t.weekMonday, t.campaignId)],
);

/** Réglages globaux (seuils du tableau du lundi, etc.), clé → valeur JSON. */
export const settings = lead.table('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/* ============================================================
   Traçabilité, jobs, liens signés, notifications
   ============================================================ */

/** Toute lecture / export / suppression de données personnelles. */
export const auditLog = lead.table(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    userEmail: text('user_email'),
    userRole: text('user_role'),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: text('object_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
);

/** Sessions « Voir en tant que » d'un admin sur un compte acheteur. */
export const impersonations = lead.table('impersonations', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull(),
  buyerId: uuid('buyer_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  actionsCount: integer('actions_count').notNull().default(0),
  note: text('note'),
});

/**
 * File de tâches en base. Chaque job est idempotent et rejouable : un tick
 * (cron chaque minute) traite ceux dont `run_at` est passé, avec verrou
 * `FOR UPDATE SKIP LOCKED`. `idempotency_key` empêche les doublons.
 */
export const jobs = lead.table(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    runAt: timestamp('run_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    status: jobStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    idempotencyKey: text('idempotency_key').unique(),
    ...timestamps,
  },
  (t) => [index('jobs_due_idx').on(t.status, t.runAt)],
);

/** Liens signés envoyés par email / SMS (validation acheteur, replanification…). Seul le hash est stocké. */
export const signedLinks = lead.table(
  'signed_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: signedLinkPurposeEnum('purpose').notNull(),
    leadId: uuid('lead_id'),
    appointmentId: uuid('appointment_id'),
    buyerId: uuid('buyer_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('signed_links_appointment_idx').on(t.appointmentId)],
);

/** Trace de chaque envoi sortant (SMS, email, Telegram) : preuve et diagnostic, jamais le contenu personnel complet. */
export const notifications = lead.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: notificationChannelEnum('channel').notNull(),
    template: text('template').notNull(),
    /** Destinataire masqué (ex. +336••••••78, k•••@breach.app). */
    recipientMasked: text('recipient_masked').notNull(),
    leadId: uuid('lead_id'),
    appointmentId: uuid('appointment_id'),
    userId: uuid('user_id'),
    status: notificationStatusEnum('status').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('notifications_lead_idx').on(t.leadId)],
);
