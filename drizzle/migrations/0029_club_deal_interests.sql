CREATE TABLE "club_deal_interests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prenom" text NOT NULL,
	"nom" text NOT NULL,
	"email" text NOT NULL,
	"telephone" text,
	"consent_tel" boolean DEFAULT false NOT NULL,
	"statut" text NOT NULL,
	"dossiers" text[] NOT NULL,
	"montant" text NOT NULL,
	"disponibilite" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"duplicate_of" text,
	"processing_status" text DEFAULT 'nouveau' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"page_url" text,
	"ip" text,
	"user_agent" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_deal_interests_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE INDEX "club_deal_interests_email_idx" ON "club_deal_interests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "club_deal_interests_created_idx" ON "club_deal_interests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "club_deal_interests_status_idx" ON "club_deal_interests" USING btree ("processing_status");--> statement-breakpoint
-- RLS dès la création : sans elle, la table serait exposée à l'API Supabase anonyme
-- jusqu'au passage de scripts/apply-rls.mjs (policies dans drizzle/policies.sql).
ALTER TABLE "club_deal_interests" ENABLE ROW LEVEL SECURITY;
