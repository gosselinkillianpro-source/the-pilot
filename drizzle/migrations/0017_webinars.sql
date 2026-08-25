CREATE TABLE "webinar_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webinar_id" uuid NOT NULL,
	"wg_subscription_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"company" text,
	"job_title" text,
	"watched" boolean DEFAULT false NOT NULL,
	"watched_live" boolean DEFAULT false NOT NULL,
	"watched_replay" boolean DEFAULT false NOT NULL,
	"watch_duration_s" integer,
	"watch_duration_replay_s" integer,
	"watch_start" timestamp with time zone,
	"watch_end" timestamp with time zone,
	"extra_fields" jsonb,
	"consent_fields" jsonb,
	"poll_votes" jsonb,
	"quiz_answers" jsonb,
	"evaluation_answers" jsonb,
	"calls_to_action" jsonb,
	"questions" jsonb,
	"investor_id" uuid,
	"rdv_contact_id" uuid,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webinars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wg_broadcast_id" text NOT NULL,
	"wg_webinar_id" text,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webinars_wg_broadcast_id_unique" UNIQUE("wg_broadcast_id")
);
--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_webinar_id_webinars_id_fk" FOREIGN KEY ("webinar_id") REFERENCES "public"."webinars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_rdv_contact_id_rdv_contacts_id_fk" FOREIGN KEY ("rdv_contact_id") REFERENCES "public"."rdv_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webinar_registrations_wg_key" ON "webinar_registrations" USING btree ("webinar_id","wg_subscription_id");--> statement-breakpoint
CREATE INDEX "webinar_registrations_email_idx" ON "webinar_registrations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "webinar_registrations_investor_idx" ON "webinar_registrations" USING btree ("investor_id");--> statement-breakpoint
-- RLS obligatoire sur toute table (règle n°1). Sans policy = accès direct refusé ;
-- l'app passe par le rôle serveur. Le cloisonnement métier est vérifié côté code.
ALTER TABLE "webinars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webinar_registrations" ENABLE ROW LEVEL SECURITY;
