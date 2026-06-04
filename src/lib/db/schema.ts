/**
 * Schéma Drizzle — data model THE PILOT (socle).
 * Source de vérité : THE_PILOT.md section 10.
 *
 * Rappel KYC : aucune donnée ultra-sensible (RIB, n° pièce d'identité, scan).
 * Côté investisseur on garde uniquement des données business + 2 booléens de statut SAH.
 */

import {
  boolean,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/* ============================================================
   ENUMS
   ============================================================ */
export const userRoleEnum = pgEnum('user_role', ['admin', 'closer', 'closer_junior', 'executive']);

export const profileSegmentEnum = pgEnum('profile_segment', [
  'junior',
  'confirmed',
  'csp_plus',
  'executive',
]);

export const acquisitionSourceEnum = pgEnum('acquisition_source', [
  'meta_ads',
  'google_ads',
  'linkedin_ads',
  'seo',
  'social_organic',
  'referral',
  'other',
]);

export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'new',
  'contacted',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'closed_won',
  'closed_lost',
  'dormant',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'draft',
  'open',
  'funding',
  'funded',
  'in_operation',
  'repaying',
  'completed',
  'cancelled',
]);

export const projectTypeEnum = pgEnum('project_type', [
  'marchand_de_biens',
  'promotion',
  'renovation',
  'autre',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'signed',
  'paid',
  'active',
  'repaid',
  'cancelled',
]);

export const interactionTypeEnum = pgEnum('interaction_type', [
  'email_sent',
  'email_opened',
  'email_clicked',
  'page_visit',
  'simulator_used',
  'dic_downloaded',
  'call_outbound',
  'call_inbound',
  'whatsapp_sent',
  'whatsapp_received',
  'linkedin_dm',
  'sms_sent',
  'meeting_booked',
  'meeting_done',
  'proposal_sent',
  'note_added',
]);

export const emailFlowStatusEnum = pgEnum('email_flow_status', [
  'draft',
  'active',
  'paused',
  'archived',
]);

export const emailFlowRunStatusEnum = pgEnum('email_flow_run_status', [
  'triggered',
  'conditions_failed',
  'pending_validation',
  'validated',
  'sent',
  'bounced',
  'converted',
]);

export const llmStatusEnum = pgEnum('llm_status', ['success', 'error', 'timeout']);

export const callOutcomeEnum = pgEnum('call_outcome', [
  'reached', // joint
  'no_answer', // pas de réponse
  'voicemail', // répondeur
  'wrong_number', // mauvais numéro
  'callback_scheduled', // rappel programmé
]);

export const closerTaskStatusEnum = pgEnum('closer_task_status', ['pending', 'done', 'cancelled']);

/* --- Social Hub --- */
export const socialIdeaStatusEnum = pgEnum('social_idea_status', [
  'pending',
  'validated',
  'rejected',
]);

export const socialIdeaCategoryEnum = pgEnum('social_idea_category', [
  'projets',
  'pedagogique',
  'temoignages',
  'mise_avant',
]);

export const socialPlatformEnum = pgEnum('social_platform', ['facebook', 'instagram', 'linkedin']);

export const socialPostStatusEnum = pgEnum('social_post_status', ['draft', 'ready', 'published']);

/* ============================================================
   USERS — utilisateurs internes (Killian, Guillaume, Stéphane…)
   ============================================================ */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // lié à auth.users de Supabase
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  role: userRoleEnum('role').notNull().default('executive'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  active: boolean('active').notNull().default(true),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

/* ============================================================
   INVESTORS — miroir read-only depuis SAH
   ============================================================ */
export const investors = pgTable('investors', {
  id: uuid('id').primaryKey().defaultRandom(),
  sahId: text('sah_id').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  civility: text('civility'), // Monsieur / Madame
  dateOfBirth: text('date_of_birth'), // date ISO ; usage marketing (anniversaire), pas de KYC sensible
  nationality: text('nationality'),
  countryResidence: text('country_residence'),
  addressStreet: text('address_street'), // street_address_and_number
  addressComplement: text('address_complement'), // additional_address
  addressCity: text('address_city'),
  addressPostalCode: text('address_postal_code'),
  taxResidencyCountry: text('tax_residency_country'),
  // Apporteur d'affaires (CGP) — best effort, voir sync
  bonusCode: text('bonus_code'),
  cgpName: text('cgp_name'),
  cgpNetwork: text('cgp_network'),
  // Lemonway / portefeuille (jamais d'IBAN/BIC : KYC bancaire interdit chez nous)
  walletBalanceCents: integer('wallet_balance_cents'),
  walletStatus: text('wallet_status'),
  lwOnboardingStatus: text('lw_onboarding_status'),
  lwOnboardingId: text('lw_onboarding_id'),
  lemonwayAccountId: text('lemonway_account_id'),
  kycValidatedAt: timestamp('kyc_validated_at', { withTimezone: true }),
  // Dates côté SAH (création / dernière modif du compte)
  sahCreatedAt: timestamp('sah_created_at', { withTimezone: true }),
  sahUpdatedAt: timestamp('sah_updated_at', { withTimezone: true }),
  profileSegment: profileSegmentEnum('profile_segment'),
  totalInvested: numeric('total_invested', { precision: 12, scale: 2 }).default('0'),
  projectsCount: integer('projects_count').default(0),
  firstSubscriptionAt: timestamp('first_subscription_at', { withTimezone: true }),
  lastSubscriptionAt: timestamp('last_subscription_at', { withTimezone: true }),
  // Statut SAH : 2 booléens, pas de KYC détaillé
  registrationComplete: boolean('registration_complete').notNull().default(false),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  acquisitionSource: acquisitionSourceEnum('acquisition_source'),
  acquisitionCampaignId: text('acquisition_campaign_id'),
  score: integer('score'),
  scoreUpdatedAt: timestamp('score_updated_at', { withTimezone: true }),
  scoreReasoning: text('score_reasoning'),
  assignedCloserId: uuid('assigned_closer_id').references(() => users.id),
  pipelineStage: pipelineStageEnum('pipeline_stage').notNull().default('new'),
  pipelineStageUpdatedAt: timestamp('pipeline_stage_updated_at', { withTimezone: true }),
  communicationConsent: boolean('communication_consent').notNull().default(false),
  lastEmailOpenedAt: timestamp('last_email_opened_at', { withTimezone: true }),
  lastPageVisitAt: timestamp('last_page_visit_at', { withTimezone: true }),
  internalNote: text('internal_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/* ============================================================
   PROJECTS — miroir read-only depuis SAH
   ============================================================ */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  sahId: text('sah_id').notNull().unique(),
  name: text('name').notNull(),
  status: projectStatusEnum('status').notNull().default('draft'),
  targetAmount: numeric('target_amount', { precision: 12, scale: 2 }),
  collectedAmount: numeric('collected_amount', { precision: 12, scale: 2 }).default('0'),
  targetYieldAnnual: numeric('target_yield_annual', { precision: 5, scale: 2 }),
  durationMonths: integer('duration_months'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  expectedCompletionAt: timestamp('expected_completion_at', { withTimezone: true }),
  locationCity: text('location_city'),
  locationRegion: text('location_region'),
  projectType: projectTypeEnum('project_type'),
  descriptionShort: text('description_short'),
  descriptionLong: text('description_long'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   SUBSCRIPTIONS — souscriptions investisseur → projet
   ============================================================ */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sahId: text('sah_id').notNull().unique(),
  investorId: uuid('investor_id')
    .notNull()
    .references(() => investors.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  sharesCount: integer('shares_count'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  status: subscriptionStatusEnum('status').notNull().default('signed'),
  expectedRepaymentAt: timestamp('expected_repayment_at', { withTimezone: true }),
  repaidAt: timestamp('repaid_at', { withTimezone: true }),
  repaidPrincipal: numeric('repaid_principal', { precision: 10, scale: 2 }),
  repaidYield: numeric('repaid_yield', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   INTERACTIONS — chaque événement tracké (cœur de l'attribution)
   ============================================================ */
export const interactions = pgTable('interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  investorId: uuid('investor_id')
    .notNull()
    .references(() => investors.id),
  type: interactionTypeEnum('type').notNull(),
  outcome: callOutcomeEnum('outcome'), // résultat d'appel (null pour les autres types)
  note: text('note'), // notes libres du closer (résumé d'appel)
  metadata: jsonb('metadata'),
  valueNumeric: numeric('value_numeric', { precision: 10, scale: 2 }),
  projectRef: uuid('project_ref').references(() => projects.id),
  userId: uuid('user_id').references(() => users.id), // qui a déclenché (null si auto)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   CLOSER TASKS — rappels & tâches du closer (callbacks programmés)
   ============================================================ */
export const closerTasks = pgTable('closer_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  investorId: uuid('investor_id')
    .notNull()
    .references(() => investors.id),
  closerId: uuid('closer_id').references(() => users.id), // à qui c'est assigné
  type: text('type').notNull().default('callback'), // callback | todo
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  note: text('note'),
  status: closerTaskStatusEnum('status').notNull().default('pending'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/* ============================================================
   EMAIL FLOWS — automations (Brevo)
   ============================================================ */
export const emailFlows = pgTable('email_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: emailFlowStatusEnum('status').notNull().default('draft'),
  triggerType: text('trigger_type').notNull(), // event | schedule | manual
  triggerConfig: jsonb('trigger_config'),
  conditions: jsonb('conditions'),
  actions: jsonb('actions'),
  statsSent: integer('stats_sent').notNull().default(0),
  statsOpened: integer('stats_opened').notNull().default(0),
  statsClicked: integer('stats_clicked').notNull().default(0),
  statsConverted: integer('stats_converted').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailFlowRuns = pgTable('email_flow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  flowId: uuid('flow_id')
    .notNull()
    .references(() => emailFlows.id),
  investorId: uuid('investor_id')
    .notNull()
    .references(() => investors.id),
  triggerEventId: uuid('trigger_event_id').references(() => interactions.id),
  status: emailFlowRunStatusEnum('status').notNull().default('triggered'),
  // Human-in-the-loop : un envoi externe exige validated_by + validated_at
  validatedBy: uuid('validated_by').references(() => users.id),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  emailContent: text('email_content'),
  amfCompliancePassed: boolean('amf_compliance_passed'),
  brevoMessageId: text('brevo_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   SOCIAL HUB — idées, posts, carrousels, veille, contexte
   Données marketing/business uniquement (jamais de PII investisseur).
   ============================================================ */

// Réglages clé/valeur du Social Hub (mix éditorial, posts par semaine, etc.)
export const socialSettings = pgTable('social_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Notes de contexte éditables injectées dans les prompts (vision, angles à pousser, faits SAH)
export const socialContextNotes = pgTable('social_context_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Idées de contenu générées par l'IA, à valider par un humain
export const socialIdeas = pgTable('social_ideas', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  angle: text('angle').notNull(),
  rationale: text('rationale'),
  category: socialIdeaCategoryEnum('category'),
  status: socialIdeaStatusEnum('status').notNull().default('pending'),
  priority: boolean('priority').notNull().default(false),
  sourceResearch: text('source_research'),
  // Si l'idée vient de la veille concurrentielle
  fromCompetitor: text('from_competitor'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Posts générés (1 idée → jusqu'à 3 posts, un par plateforme)
export const socialPosts = pgTable('social_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').references(() => socialIdeas.id, { onDelete: 'set null' }),
  // Projet SAH éventuellement référencé (réutilise la table projects existante)
  projectId: uuid('project_id').references(() => projects.id),
  platform: socialPlatformEnum('platform').notNull(),
  text: text('text').notNull(),
  isCarousel: boolean('is_carousel').notNull().default(false),
  noImage: boolean('no_image').notNull().default(true),
  // Chemin Supabase Storage de l'image (si visuel photo)
  imagePath: text('image_path'),
  imagePrompt: text('image_prompt'),
  scheduledDate: text('scheduled_date'),
  scheduledTime: text('scheduled_time'),
  status: socialPostStatusEnum('status').notNull().default('draft'),
  amfPassed: boolean('amf_passed'),
  amfIssues: jsonb('amf_issues'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Slides d'un carrousel (layout varié stocké en JSON dans extra)
export const socialCarouselSlides = pgTable('social_carousel_slides', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => socialPosts.id, { onDelete: 'cascade' }),
  slideIndex: integer('slide_index').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  // layout + champs spécifiques (sub_cards, bullets, stats, etc.)
  extra: jsonb('extra'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Rapports de veille concurrentielle (1 par concurrent par run)
export const socialCompetitorReports = pgTable('social_competitor_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  competitor: text('competitor').notNull(),
  report: jsonb('report').notNull(),
  weekStart: text('week_start').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   AUDIT LOG — append-only, toute action sensible
   ============================================================ */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  userRole: text('user_role'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   LLM CALLS — log de chaque appel IA (coût, audit, debug)
   ============================================================ */
export const llmCalls = pgTable('llm_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  purpose: text('purpose').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  costEur: numeric('cost_eur', { precision: 10, scale: 6 }),
  latencyMs: integer('latency_ms'),
  status: llmStatusEnum('status').notNull(),
  errorMessage: text('error_message'),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   EMAIL EVENTS — événements Brevo reçus par webhook
   (livré, ouvert, cliqué, bounce…). Alimente le scoring email
   et l'activité par contact. Stocké brut + champs indexables.
   ============================================================ */
export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: text('message_id'),
  email: text('email').notNull(),
  event: text('event').notNull(),
  subject: text('subject'),
  link: text('link'),
  tag: text('tag'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
