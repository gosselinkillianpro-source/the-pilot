CREATE SCHEMA "lead";
--> statement-breakpoint
CREATE TYPE "lead"."actor_type" AS ENUM('system', 'setter', 'buyer', 'admin');--> statement-breakpoint
CREATE TYPE "lead"."appointment_status" AS ENUM('pose', 'honore', 'absent', 'reprogramme', 'annule');--> statement-breakpoint
CREATE TYPE "lead"."buyer_user_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "lead"."calendar_provider" AS ENUM('calendly_oauth', 'calendly_link', 'calcom', 'google', 'manual');--> statement-breakpoint
CREATE TYPE "lead"."call_outcome" AS ENUM('repondu', 'messagerie', 'occupe', 'faux_numero');--> statement-breakpoint
CREATE TYPE "lead"."conformity" AS ENUM('conforme', 'non_conforme');--> statement-breakpoint
CREATE TYPE "lead"."conversion_event_name" AS ENUM('Lead', 'Schedule', 'RDV_Honore', 'RDV_Conforme', 'Signe');--> statement-breakpoint
CREATE TYPE "lead"."disposition" AS ENUM('rdv_pose', 'rappeler', 'nourrir', 'hors_cible', 'injoignable');--> statement-breakpoint
CREATE TYPE "lead"."hors_cible_reason" AS ENUM('doublon', 'faux_numero', 'montant_hors_criteres', 'timing_hors_criteres', 'hors_zone', 'deja_client', 'pas_interesse', 'autre');--> statement-breakpoint
CREATE TYPE "lead"."invoice_status" AS ENUM('brouillon', 'emise', 'payee');--> statement-breakpoint
CREATE TYPE "lead"."job_status" AS ENUM('pending', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "lead"."lead_state" AS ENUM('nouveau', 'a_rappeler', 'en_appel', 'qualifie', 'rdv_pose', 'a_rappeler_plus_tard', 'a_nourrir', 'hors_cible', 'injoignable', 'honore', 'absent', 'reprogramme', 'conforme', 'non_conforme', 'retour_accepte', 'retour_refuse', 'en_cours', 'signe', 'perdu');--> statement-breakpoint
CREATE TYPE "lead"."non_conformity_reason" AS ENUM('faux_numero', 'montant_hors_criteres', 'timing_hors_criteres', 'doublon', 'deja_client', 'autre');--> statement-breakpoint
CREATE TYPE "lead"."notification_channel" AS ENUM('sms', 'email', 'telegram');--> statement-breakpoint
CREATE TYPE "lead"."notification_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "lead"."nurture_export_target" AS ENUM('brevo', 'none');--> statement-breakpoint
CREATE TYPE "lead"."nurture_reason" AS ENUM('curiosite', 'montant_sous_seuil', 'pas_maintenant');--> statement-breakpoint
CREATE TYPE "lead"."outcome" AS ENUM('en_cours', 'signe', 'perdu');--> statement-breakpoint
CREATE TYPE "lead"."pack_status" AS ENUM('actif', 'epuise', 'clos');--> statement-breakpoint
CREATE TYPE "lead"."platform" AS ENUM('meta', 'google', 'organic', 'other');--> statement-breakpoint
CREATE TYPE "lead"."return_status" AS ENUM('demande', 'accepte', 'refuse');--> statement-breakpoint
CREATE TYPE "lead"."signed_link_purpose" AS ENUM('buyer_validation', 'reschedule', 'slot_pick', 'reroute_consent');--> statement-breakpoint
CREATE TYPE "lead"."user_role" AS ENUM('admin', 'setter', 'buyer');--> statement-breakpoint
CREATE TYPE "lead"."validated_by" AS ENUM('buyer', 'tacit', 'admin');--> statement-breakpoint
CREATE TABLE "lead"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"calendar_event_id" text,
	"booking_url" text,
	"status" "lead"."appointment_status" DEFAULT 'pose' NOT NULL,
	"conformity" "lead"."conformity",
	"non_conformity_reason" "lead"."non_conformity_reason",
	"validated_at" timestamp with time zone,
	"validated_by" "lead"."validated_by",
	"validation_due_at" timestamp with time zone NOT NULL,
	"outcome" "lead"."outcome",
	"outcome_at" timestamp with time zone,
	"return_status" "lead"."return_status",
	"return_comment" text,
	"return_decided_at" timestamp with time zone,
	"replacement_of" uuid,
	"billable" boolean DEFAULT false NOT NULL,
	"pack_id" uuid,
	"setter_notes" text,
	"buyer_notes" text,
	"reminder_j1_sent_at" timestamp with time zone,
	"reminder_h2_sent_at" timestamp with time zone,
	"validation_reminder_24_sent_at" timestamp with time zone,
	"validation_reminder_44_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"user_role" text,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text,
	"metadata" jsonb,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."buyer_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"role" "lead"."buyer_user_role" DEFAULT 'owner' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"orias_number" text NOT NULL,
	"contact_name" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"criteria" jsonb DEFAULT '{"obligatoires":[]}'::jsonb NOT NULL,
	"daily_cap" integer,
	"weekly_cap" integer,
	"priority" integer DEFAULT 1 NOT NULL,
	"exclusive" boolean DEFAULT true NOT NULL,
	"price_per_rdv_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"signed_value_cents" integer,
	"validation_delay_hours" integer DEFAULT 48 NOT NULL,
	"tacit_validation_enabled" boolean DEFAULT false NOT NULL,
	"calendar_provider" "lead"."calendar_provider" DEFAULT 'manual' NOT NULL,
	"calendar_config" jsonb,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"paused_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."calendly_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"calendly_user_uri" text NOT NULL,
	"organization_uri" text,
	"scheduling_url" text,
	"event_type_uri" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"webhook_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendly_connections_buyer_id_unique" UNIQUE("buyer_id")
);
--> statement-breakpoint
CREATE TABLE "lead"."call_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"setter_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"outcome" "lead"."call_outcome",
	"notes" text,
	"recording_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."campaign_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"week_monday" timestamp with time zone NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"platform" "lead"."platform" DEFAULT 'other' NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"adset_name" text DEFAULT '' NOT NULL,
	"ad_name" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"appointment_id" uuid,
	"platform" "lead"."platform" DEFAULT 'meta' NOT NULL,
	"event_name" "lead"."conversion_event_name" NOT NULL,
	"event_id" text NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"payload_hash" text,
	"sent_at" timestamp with time zone,
	"response_status" integer,
	"error" text,
	"delivered_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversion_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "lead"."impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"actions_count" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "lead"."invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"appointment_id" uuid,
	"label" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" "lead"."invoice_status" DEFAULT 'brouillon' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "lead"."job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "lead"."lead_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_type" "lead"."actor_type" NOT NULL,
	"actor_id" uuid,
	"on_behalf_of" uuid,
	"from_state" "lead"."lead_state",
	"to_state" "lead"."lead_state",
	"kind" text DEFAULT 'transition' NOT NULL,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone_e164" text NOT NULL,
	"email" text,
	"locale" text DEFAULT 'fr-FR' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answers_version" text,
	"answers_completed_at" timestamp with time zone,
	"site_score" integer,
	"consent_text" text NOT NULL,
	"consent_version" text,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_ip_hash" text,
	"consent_user_agent" text,
	"consent_partner_transfer" boolean DEFAULT true NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"fbclid" text,
	"fbc" text,
	"fbp" text,
	"landing_url" text,
	"referrer" text,
	"page_path" text,
	"campaign_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"first_call_at" timestamp with time zone,
	"sla_minutes_effective" integer,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"callback_at" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	"sla_alert_level" integer DEFAULT 0 NOT NULL,
	"state" "lead"."lead_state" DEFAULT 'nouveau' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_reason" "lead"."hors_cible_reason",
	"nurture_reason" "lead"."nurture_reason",
	"dedupe_of" uuid,
	"buyer_id" uuid,
	"routed_at" timestamp with time zone,
	"reroute_consent_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"raw_payload" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "lead"."notification_channel" NOT NULL,
	"template" text NOT NULL,
	"recipient_masked" text NOT NULL,
	"lead_id" uuid,
	"appointment_id" uuid,
	"user_id" uuid,
	"status" "lead"."notification_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"size" integer DEFAULT 10 NOT NULL,
	"price_cents_per_rdv" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"prepaid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"remaining" integer NOT NULL,
	"low_threshold" integer DEFAULT 2 NOT NULL,
	"low_alert_sent_at" timestamp with time zone,
	"status" "lead"."pack_status" DEFAULT 'actif' NOT NULL,
	"is_pilot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"setter_id" uuid,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"disposition" "lead"."disposition",
	"disposition_reason" text,
	"notes" text,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qualifications_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "lead"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead"."signed_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "lead"."signed_link_purpose" NOT NULL,
	"lead_id" uuid,
	"appointment_id" uuid,
	"buyer_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signed_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "lead"."sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"service_hours" jsonb NOT NULL,
	"webhook_secret" text NOT NULL,
	"sla_target_min" integer DEFAULT 5 NOT NULL,
	"sla_alert_min" integer DEFAULT 10 NOT NULL,
	"nurture_export_target" "lead"."nurture_export_target" DEFAULT 'none' NOT NULL,
	"script" jsonb,
	"off_hours_sms" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lead"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "lead"."user_role" DEFAULT 'setter' NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buyer_id" uuid,
	"on_duty" boolean DEFAULT false NOT NULL,
	"phone_for_alerts" text,
	"telegram_chat_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "lead"."weekly_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"week_monday" timestamp with time zone NOT NULL,
	"campaign_id" uuid,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"cpl_cents" integer,
	"rdv_poses" integer DEFAULT 0 NOT NULL,
	"taux_prise" integer,
	"honores" integer DEFAULT 0 NOT NULL,
	"taux_presence" integer,
	"conformes" integer DEFAULT 0 NOT NULL,
	"taux_conformite" integer,
	"cout_par_rdv_conforme_cents" integer,
	"signes" integer DEFAULT 0 NOT NULL,
	"delai_moyen_min" integer,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead"."appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "lead"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."appointments" ADD CONSTRAINT "appointments_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "lead"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."buyer_users" ADD CONSTRAINT "buyer_users_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "lead"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."buyers" ADD CONSTRAINT "buyers_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "lead"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."calendly_connections" ADD CONSTRAINT "calendly_connections_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "lead"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."call_attempts" ADD CONSTRAINT "call_attempts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "lead"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."campaign_spend" ADD CONSTRAINT "campaign_spend_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "lead"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."campaign_spend" ADD CONSTRAINT "campaign_spend_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "lead"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."campaigns" ADD CONSTRAINT "campaigns_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "lead"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."conversion_events" ADD CONSTRAINT "conversion_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "lead"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "lead"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."invoices" ADD CONSTRAINT "invoices_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "lead"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "lead"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."leads" ADD CONSTRAINT "leads_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "lead"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "lead"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."packs" ADD CONSTRAINT "packs_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "lead"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."qualifications" ADD CONSTRAINT "qualifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "lead"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."weekly_metrics" ADD CONSTRAINT "weekly_metrics_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "lead"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead"."weekly_metrics" ADD CONSTRAINT "weekly_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "lead"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_buyer_idx" ON "lead"."appointments" USING btree ("buyer_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointments_lead_idx" ON "lead"."appointments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "appointments_validation_due_idx" ON "lead"."appointments" USING btree ("validation_due_at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "lead"."audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_users_buyer_email_uq" ON "lead"."buyer_users" USING btree ("buyer_id","email");--> statement-breakpoint
CREATE INDEX "call_attempts_lead_idx" ON "lead"."call_attempts" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_spend_week_uq" ON "lead"."campaign_spend" USING btree ("source_id","campaign_id","week_monday");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_source_triplet_uq" ON "lead"."campaigns" USING btree ("source_id","name","adset_name","ad_name");--> statement-breakpoint
CREATE INDEX "conversion_events_lead_idx" ON "lead"."conversion_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "lead"."jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead"."lead_events" USING btree ("lead_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_source_idempotency_uq" ON "lead"."leads" USING btree ("source_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "lead"."leads" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "lead"."leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "lead"."leads" USING btree ("state");--> statement-breakpoint
CREATE INDEX "leads_received_idx" ON "lead"."leads" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "leads_buyer_idx" ON "lead"."leads" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "notifications_lead_idx" ON "lead"."notifications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "signed_links_appointment_idx" ON "lead"."signed_links" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_metrics_uq" ON "lead"."weekly_metrics" USING btree ("source_id","week_monday","campaign_id");