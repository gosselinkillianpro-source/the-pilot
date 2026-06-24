/**
 * Schéma Drizzle — data model THE PILOT (socle).
 * Source de vérité : THE_PILOT.md section 10.
 *
 * Rappel KYC : aucune donnée ultra-sensible (RIB, n° pièce d'identité, scan).
 * Côté investisseur on garde uniquement des données business + 2 booléens de statut SAH.
 */

import {
  boolean,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/* ============================================================
   ENUMS
   ============================================================ */
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'closer',
  'closer_junior',
  'executive',
  'admin_affiliate', // affilié SAH : accès restreint à son seul sous-réseau (espace dédié)
]);

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

// Documents générés par l'IA et sauvegardés sur la fiche (email de proposition, script d'appel).
export const investorAssetKindEnum = pgEnum('investor_asset_kind', [
  'email_proposal',
  'call_script',
]);
export const investorAssetStatusEnum = pgEnum('investor_asset_status', [
  'generating',
  'ready',
  'error',
]);

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
  // Comptes "admin affilié" uniquement : sah_id de la personne SAH représentée par ce
  // compte. Sert à scoper l'accès à son seul sous-réseau. NULL pour le staff interne.
  sahUserId: text('sah_user_id'),
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
  // Dates de PROGRESSION détectées par THE PILOT au moment où le booléen bascule false→true
  // (SAH ne fournit pas ces dates). Write-once, jamais écrasées par le sync. Servent à
  // attribuer la finalisation au closer qui a appelé avant (fenêtre 30 j).
  kycCompletedAt: timestamp('kyc_completed_at', { withTimezone: true }),
  registrationCompletedAt: timestamp('registration_completed_at', { withTimezone: true }),
  acquisitionSource: acquisitionSourceEnum('acquisition_source'),
  acquisitionCampaignId: text('acquisition_campaign_id'),
  // Parrainage BREACH multi-niveaux — reconstruit depuis SAH (users.invited_by_id).
  parentSahId: text('parent_sah_id'), // sah_id du parrain (la personne qui a invité celle-ci)
  parrainName: text('parrain_name'), // nom du parrain direct (affichage fiche)
  breachLevel: integer('breach_level'), // 0 = BREACH direct, 1 = N-1, 2 = N-2… ; null = hors réseau BREACH
  score: integer('score'),
  scoreUpdatedAt: timestamp('score_updated_at', { withTimezone: true }),
  scoreReasoning: text('score_reasoning'),
  assignedCloserId: uuid('assigned_closer_id').references(() => users.id),
  // Verrou de travail : un closer "prend" un lead pour éviter le double-appel.
  // Auto-libéré après un délai (cf. CLAIM_TTL_MIN) ou après l'enregistrement de l'appel.
  claimedById: uuid('claimed_by_id').references(() => users.id),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
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
   AFFILIATE_NETWORK — appartenance réseau (multi-niveaux) pour l'ISOLATION des
   comptes "admin affilié". Une ligne par (investisseur, ancêtre, profondeur).
   Recalculé à chaque sync depuis parent_sah_id : un investisseur appartient au
   réseau de CHACUN de ses ancêtres (parrain direct = depth 1, grand-parrain = 2…).
   Un admin (owner_sah_id) ne voit QUE les investisseurs présents ici sous son sah_id.
   ============================================================ */
export const affiliateNetwork = pgTable(
  'affiliate_network',
  {
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'cascade' }),
    ownerSahId: text('owner_sah_id').notNull(), // sah_id d'un ancêtre (l'admin propriétaire du réseau)
    depth: integer('depth').notNull(), // 1 = filleul direct, 2 = N-2…
  },
  (t) => ({
    pk: primaryKey({ columns: [t.investorId, t.ownerSahId] }),
    ownerIdx: index('affiliate_network_owner_idx').on(t.ownerSahId),
  }),
);

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
  // Date réelle de remboursement (dernière échéance SAH : lending_terms/royalties_terms).
  // Signal d'échéance pour les relances avant remboursement (re-mobilisation des fonds).
  repaymentDate: timestamp('repayment_date', { withTimezone: true }),
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
   INVESTOR ASSETS — emails & scripts générés par l'IA, sauvegardés par personne.
   Un seul "actuel" par type et par investisseur (régénérer remplace, supprimer efface).
   status: generating → ready (ou error). Permet la génération en fond.
   ============================================================ */
export const investorAssets = pgTable('investor_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  investorId: uuid('investor_id')
    .notNull()
    .references(() => investors.id),
  kind: investorAssetKindEnum('kind').notNull(),
  status: investorAssetStatusEnum('status').notNull().default('generating'),
  subject: text('subject'), // email uniquement
  preheader: text('preheader'), // email uniquement
  body: text('body'), // corps de l'email OU script (texte)
  data: jsonb('data'), // contenu structuré (brief d'appel, avertissements AMF…)
  error: text('error'),
  costEur: numeric('cost_eur', { precision: 10, scale: 6 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
