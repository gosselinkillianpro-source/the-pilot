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
  dateOfBirth: text('date_of_birth'), // date ISO ; usage marketing (anniversaire), pas de KYC sensible
  addressCity: text('address_city'),
  addressPostalCode: text('address_postal_code'),
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
  signedAt: timestamp('signed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
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
  metadata: jsonb('metadata'),
  valueNumeric: numeric('value_numeric', { precision: 10, scale: 2 }),
  projectRef: uuid('project_ref').references(() => projects.id),
  userId: uuid('user_id').references(() => users.id), // qui a déclenché (null si auto)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
