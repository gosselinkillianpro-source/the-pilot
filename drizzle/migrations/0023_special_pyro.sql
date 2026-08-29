CREATE TABLE "closer_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"closer_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"period_key" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "gamification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"closer_id" uuid,
	"investor_id" uuid,
	"amount" numeric(12, 2),
	"badge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"announced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "closer_badges" ADD CONSTRAINT "closer_badges_closer_id_users_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_events" ADD CONSTRAINT "gamification_events_closer_id_users_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_events" ADD CONSTRAINT "gamification_events_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closer_badges_award_key" ON "closer_badges" USING btree ("closer_id","badge","period_key");--> statement-breakpoint
CREATE INDEX "closer_badges_closer_idx" ON "closer_badges" USING btree ("closer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gamification_events_ref_key" ON "gamification_events" USING btree ("ref_id");--> statement-breakpoint
CREATE INDEX "gamification_events_created_idx" ON "gamification_events" USING btree ("created_at");