ALTER TABLE "investors" ADD COLUMN "redistribution_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accepts_new_leads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_lead_distributed_at" timestamp with time zone;