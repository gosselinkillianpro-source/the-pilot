CREATE TYPE "public"."acquisition_source" AS ENUM('meta_ads', 'google_ads', 'linkedin_ads', 'seo', 'social_organic', 'referral', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_flow_run_status" AS ENUM('triggered', 'conditions_failed', 'pending_validation', 'validated', 'sent', 'bounced', 'converted');--> statement-breakpoint
CREATE TYPE "public"."email_flow_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('email_sent', 'email_opened', 'email_clicked', 'page_visit', 'simulator_used', 'dic_downloaded', 'call_outbound', 'call_inbound', 'whatsapp_sent', 'whatsapp_received', 'linkedin_dm', 'sms_sent', 'meeting_booked', 'meeting_done', 'proposal_sent', 'note_added');--> statement-breakpoint
CREATE TYPE "public"."llm_status" AS ENUM('success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('new', 'contacted', 'meeting_booked', 'meeting_done', 'proposal_sent', 'closed_won', 'closed_lost', 'dormant');--> statement-breakpoint
CREATE TYPE "public"."profile_segment" AS ENUM('junior', 'confirmed', 'csp_plus', 'executive');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'open', 'funding', 'funded', 'in_operation', 'repaying', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('marchand_de_biens', 'promotion', 'renovation', 'autre');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('signed', 'paid', 'active', 'repaid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'closer', 'closer_junior', 'executive');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" text,
	"user_role" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_flow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"trigger_event_id" uuid,
	"status" "email_flow_run_status" DEFAULT 'triggered' NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"email_content" text,
	"amf_compliance_passed" boolean,
	"brevo_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "email_flow_status" DEFAULT 'draft' NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb,
	"conditions" jsonb,
	"actions" jsonb,
	"stats_sent" integer DEFAULT 0 NOT NULL,
	"stats_opened" integer DEFAULT 0 NOT NULL,
	"stats_clicked" integer DEFAULT 0 NOT NULL,
	"stats_converted" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"type" "interaction_type" NOT NULL,
	"metadata" jsonb,
	"value_numeric" numeric(10, 2),
	"project_ref" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sah_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"date_of_birth" text,
	"address_city" text,
	"address_postal_code" text,
	"profile_segment" "profile_segment",
	"total_invested" numeric(12, 2) DEFAULT '0',
	"projects_count" integer DEFAULT 0,
	"first_subscription_at" timestamp with time zone,
	"last_subscription_at" timestamp with time zone,
	"registration_complete" boolean DEFAULT false NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"acquisition_source" "acquisition_source",
	"acquisition_campaign_id" text,
	"score" integer,
	"score_updated_at" timestamp with time zone,
	"score_reasoning" text,
	"assigned_closer_id" uuid,
	"pipeline_stage" "pipeline_stage" DEFAULT 'new' NOT NULL,
	"pipeline_stage_updated_at" timestamp with time zone,
	"communication_consent" boolean DEFAULT false NOT NULL,
	"last_email_opened_at" timestamp with time zone,
	"last_page_visit_at" timestamp with time zone,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "investors_sah_id_unique" UNIQUE("sah_id")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_eur" numeric(10, 6),
	"latency_ms" integer,
	"status" "llm_status" NOT NULL,
	"error_message" text,
	"input_summary" text,
	"output_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sah_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"target_amount" numeric(12, 2),
	"collected_amount" numeric(12, 2) DEFAULT '0',
	"target_yield_annual" numeric(5, 2),
	"duration_months" integer,
	"opened_at" timestamp with time zone,
	"expected_completion_at" timestamp with time zone,
	"location_city" text,
	"location_region" text,
	"project_type" "project_type",
	"description_short" text,
	"description_long" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_sah_id_unique" UNIQUE("sah_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sah_id" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"signed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"status" "subscription_status" DEFAULT 'signed' NOT NULL,
	"expected_repayment_at" timestamp with time zone,
	"repaid_at" timestamp with time zone,
	"repaid_principal" numeric(10, 2),
	"repaid_yield" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_sah_id_unique" UNIQUE("sah_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" DEFAULT 'executive' NOT NULL,
	"avatar_url" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_flow_runs" ADD CONSTRAINT "email_flow_runs_flow_id_email_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."email_flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_flow_runs" ADD CONSTRAINT "email_flow_runs_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_flow_runs" ADD CONSTRAINT "email_flow_runs_trigger_event_id_interactions_id_fk" FOREIGN KEY ("trigger_event_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_flow_runs" ADD CONSTRAINT "email_flow_runs_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_flows" ADD CONSTRAINT "email_flows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_project_ref_projects_id_fk" FOREIGN KEY ("project_ref") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_assigned_closer_id_users_id_fk" FOREIGN KEY ("assigned_closer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;