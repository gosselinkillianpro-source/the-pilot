CREATE TYPE "public"."investor_asset_kind" AS ENUM('email_proposal', 'call_script');--> statement-breakpoint
CREATE TYPE "public"."investor_asset_status" AS ENUM('generating', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "investor_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"kind" "investor_asset_kind" NOT NULL,
	"status" "investor_asset_status" DEFAULT 'generating' NOT NULL,
	"subject" text,
	"preheader" text,
	"body" text,
	"data" jsonb,
	"error" text,
	"cost_eur" numeric(10, 6),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_assets" ADD CONSTRAINT "investor_assets_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_assets" ADD CONSTRAINT "investor_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;