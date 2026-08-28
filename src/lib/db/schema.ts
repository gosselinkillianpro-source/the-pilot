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
  uniqueIndex,
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
  // Suivi d'appel (ajoutées le 25/08/2026) : sans elles, un closer qualifiait un
  // appel « pas de réponse » et la personne ne changeait d'état nulle part.
  'to_call_back',
  'interested',
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

export const llmStatusEnum = pgEnum('llm_status', ['success', 'error', 'timeout']);

export const callOutcomeEnum = pgEnum('call_outcome', [
  'reached', // joint
  'no_answer', // pas de réponse
  'voicemail', // répondeur
  'wrong_number', // mauvais numéro
  'callback_scheduled', // rappel programmé
  'profile_incompatible', // profil incompatible (→ lead sorti de la file / Perdu)
  'in_progress', // en cours (échange en cours, à poursuivre)
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
  /**
   * Identifiant de conversation Telegram, pour l'alerte « nouveau lead ».
   * Renseigné par chaque closer depuis /equipe. NULL = pas d'alerte poussée.
   */
  telegramChatId: text('telegram_chat_id'),
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
  // Date détectée (par THE PILOT) où le wallet est devenu alimenté (≥ seuil) sans être
  // investi ; remise à null quand il se vide. Alimente le scoring « argent à placer ».
  walletFundedAt: timestamp('wallet_funded_at', { withTimezone: true }),
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
  /**
   * File d'appels d'où venait la personne quand elle est entrée dans le suivi
   * (« Nouveaux inscrits », « Argent à placer »…). Figée à l'entrée : le score
   * se recalcule en permanence, donc la file COURANTE d'une fiche suivie depuis
   * trois semaines ne dit plus rien de la raison pour laquelle on l'a appelée.
   */
  pipelineSource: text('pipeline_source'),
  /** Entrée dans le tableau de suivi — mesure la durée réelle du parcours. */
  pipelineEnteredAt: timestamp('pipeline_entered_at', { withTimezone: true }),
  /**
   * Alerte « nouveau lead » envoyée aux closers. Write-once : c'est ce qui
   * garantit qu'une inscription ne déclenche qu'UNE notification, même si le
   * détecteur repasse toutes les 2 minutes sur la même personne.
   */
  newLeadAlertedAt: timestamp('new_lead_alerted_at', { withTimezone: true }),
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
  /**
   * Nullable depuis l'ouverture des RDV aux prospects : quelqu'un peut prendre
   * rendez-vous sans avoir de compte SAH. Exactement UN de `investorId` /
   * `rdvContactId` est renseigné (contrainte en base).
   */
  investorId: uuid('investor_id').references(() => investors.id),
  rdvContactId: uuid('rdv_contact_id'),
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
  /** Nullable : une action peut porter sur un prospect RDV pas encore dans SAH. */
  investorId: uuid('investor_id').references(() => investors.id),
  rdvContactId: uuid('rdv_contact_id'),
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

/* ============================================================
   CALENDLY — connexion OAuth par utilisateur
   Chaque closer relie SON agenda. Plus de token global : la page
   /rdv est celle du compte connecté (l'admin peut voir les autres).
   ============================================================ */
export const calendlyConnections = pgTable('calendly_connections', {
  // Un compte = un Calendly. Reconnecter écrase la connexion existante.
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Identité Calendly, pour afficher « connecté en tant que » sans appel API.
  calendlyUserUri: text('calendly_user_uri').notNull(),
  calendlyOrgUri: text('calendly_org_uri').notNull(),
  calendlyEmail: text('calendly_email').notNull(),
  calendlyName: text('calendly_name'),
  // ⚠️ Chiffrés côté application (lib/crypto/secret-box) — jamais en clair.
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Déconnexion : on garde la ligne pour l'audit, on cesse de l'utiliser.
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

/* ============================================================
   CONTACTS RDV — les gens qui prennent rendez-vous
   Un invité Calendly n'a pas forcément de compte SAH. Cette table
   lui donne une fiche (notes, actions) en attendant, et porte le
   LIEN MANUEL vers l'investisseur quand les e-mails diffèrent.
   ============================================================ */
export const contactSourceEnum = pgEnum('contact_source', ['calendly', 'webinar', 'manuel']);

/**
 * Colonnes du tableau de suivi (kanban) d'un inscrit pris en charge.
 *
 * L'ordre est celui du parcours réel : on prend la personne, on l'appelle, on
 * qualifie son intérêt, elle finalise son compte SAH (KYC), elle investit.
 * `lost` est à part : c'est une sortie, pas une étape.
 *
 * La règle de progression vit dans `webinars/pipeline.ts` (module testé).
 */
export const contactStageEnum = pgEnum('contact_stage', [
  'taken',
  'called',
  'interested',
  'account_ready',
  'invested',
  'lost',
]);

export const rdvContacts = pgTable('rdv_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * Closer propriétaire. NULLABLE : un inscrit à un webinaire n'appartient à
   * personne tant qu'un closer ne l'a pas pris en charge, contrairement à un
   * RDV Calendly qui a toujours un agenda d'origine.
   */
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  /** D'où vient ce contact — conditionne l'écran qui le présente. */
  source: contactSourceEnum('source').notNull().default('calendly'),
  /**
   * Clé de rapprochement avec une fiche investisseur SAH.
   * ⚠️ La colonne s'appelle encore `calendly_email` en base : la table est née
   * pour les RDV Calendly avant d'accueillir les inscrits webinaire. Renommer
   * exigerait une confirmation interactive de drizzle-kit, impossible ici — la
   * propriété TypeScript porte le bon nom, c'est ce que lit le code.
   */
  email: text('calendly_email').notNull(),
  fullName: text('full_name'),
  phone: text('phone'),
  notes: text('notes'),
  /**
   * Lien vers la fiche SAH. Rempli automatiquement si l'e-mail Calendly
   * correspond, ou À LA MAIN par le closer quand la personne s'est inscrite
   * avec une autre adresse. `linkedBy` trace qui a fait le rapprochement.
   */
  investorId: uuid('investor_id').references(() => investors.id, { onDelete: 'set null' }),
  linkedBy: uuid('linked_by').references(() => users.id),
  linkedAt: timestamp('linked_at', { withTimezone: true }),
  /**
   * Colonne du tableau de suivi. NULL = la personne n'est pas encore suivie :
   * elle vit dans la liste du webinaire, pas dans le kanban. Une carte naît
   * quand un closer prend la fiche ou enregistre un appel.
   */
  pipelineStage: contactStageEnum('pipeline_stage'),
  /** Entrée dans le suivi — sert à mesurer le temps total du parcours. */
  pipelineEnteredAt: timestamp('pipeline_entered_at', { withTimezone: true }),
  /** Dernier changement de colonne — sert à repérer les cartes qui dorment. */
  pipelineStageUpdatedAt: timestamp('pipeline_stage_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   WEBINAIRES — miroir WebinarGeek
   Remplace l'export CSV manuel. Une session = un `webinars`,
   un inscrit = un `webinar_registrations` portant TOUT son
   engagement (présence, durée, sondages, CTA cliqués).
   ============================================================ */
export const webinars = pgTable('webinars', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Identifiant de la diffusion côté WebinarGeek — clé de synchro. */
  wgBroadcastId: text('wg_broadcast_id').notNull().unique(),
  wgWebinarId: text('wg_webinar_id'),
  title: text('title').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  /** Dernière synchro réussie depuis l'API — pour afficher une fraîcheur honnête. */
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webinarRegistrations = pgTable(
  'webinar_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webinarId: uuid('webinar_id')
      .notNull()
      .references(() => webinars.id, { onDelete: 'cascade' }),
    /** Identifiant de l'inscription côté WebinarGeek. */
    wgSubscriptionId: text('wg_subscription_id').notNull(),

    // --- Identité (telle que saisie au formulaire) ---
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    company: text('company'),
    jobTitle: text('job_title'),

    // --- Engagement : le cœur de ce que l'export CSV apportait ---
    watched: boolean('watched').notNull().default(false),
    watchedLive: boolean('watched_live').notNull().default(false),
    watchedReplay: boolean('watched_replay').notNull().default(false),
    /** Durée réelle de visionnage en direct, en secondes. */
    watchDurationS: integer('watch_duration_s'),
    watchDurationReplayS: integer('watch_duration_replay_s'),
    watchStart: timestamp('watch_start', { withTimezone: true }),
    watchEnd: timestamp('watch_end', { withTimezone: true }),

    // --- Réponses et actions (JSON brut de WebinarGeek) ---
    /** Champs libres du formulaire : le questionnaire d'onboarding. */
    extraFields: jsonb('extra_fields'),
    /** Consentements cochés — base légale d'une relance marketing. */
    consentFields: jsonb('consent_fields'),
    pollVotes: jsonb('poll_votes'),
    quizAnswers: jsonb('quiz_answers'),
    evaluationAnswers: jsonb('evaluation_answers'),
    /** CTA cliqués, horodatés : le signal d'intérêt le plus fort. */
    callsToAction: jsonb('calls_to_action'),
    questions: jsonb('questions'),

    // --- Rattachement CRM ---
    /** Investisseur SAH correspondant (par e-mail, ou `external_id`). */
    investorId: uuid('investor_id').references(() => investors.id, { onDelete: 'set null' }),
    /** Sinon, fiche prospect locale — un inscrit n'a pas forcément de compte SAH. */
    rdvContactId: uuid('rdv_contact_id').references(() => rdvContacts.id, {
      onDelete: 'set null',
    }),

    unsubscribed: boolean('unsubscribed').notNull().default(false),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Une inscription WebinarGeek n'existe qu'une fois par webinaire.
    uniqueIndex('webinar_registrations_wg_key').on(t.webinarId, t.wgSubscriptionId),
    index('webinar_registrations_email_idx').on(t.email),
    index('webinar_registrations_investor_idx').on(t.investorId),
  ],
);
