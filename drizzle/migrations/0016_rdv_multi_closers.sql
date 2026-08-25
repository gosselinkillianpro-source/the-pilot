CREATE TABLE "calendly_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calendly_user_uri" text NOT NULL,
	"calendly_org_uri" text NOT NULL,
	"calendly_email" text NOT NULL,
	"calendly_name" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rdv_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"calendly_email" text NOT NULL,
	"full_name" text,
	"phone" text,
	"notes" text,
	"investor_id" uuid,
	"linked_by" uuid,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "closer_tasks" ALTER COLUMN "investor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interactions" ALTER COLUMN "investor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD COLUMN "rdv_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "rdv_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "calendly_connections" ADD CONSTRAINT "calendly_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD CONSTRAINT "rdv_contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD CONSTRAINT "rdv_contacts_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD CONSTRAINT "rdv_contacts_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Rattachement des interactions / tâches à un contact RDV (prospect hors SAH).
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_rdv_contact_id_fk" FOREIGN KEY ("rdv_contact_id") REFERENCES "public"."rdv_contacts"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD CONSTRAINT "closer_tasks_rdv_contact_id_fk" FOREIGN KEY ("rdv_contact_id") REFERENCES "public"."rdv_contacts"("id") ON DELETE cascade;--> statement-breakpoint

-- Exactement UNE cible : soit un investisseur SAH, soit un contact RDV. Jamais
-- les deux, jamais aucun — sinon une note deviendrait orpheline et invisible.
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_one_target"
  CHECK (("investor_id" IS NOT NULL) <> ("rdv_contact_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD CONSTRAINT "closer_tasks_one_target"
  CHECK (("investor_id" IS NOT NULL) <> ("rdv_contact_id" IS NOT NULL));--> statement-breakpoint

-- Un même e-mail Calendly ne peut avoir qu'une fiche par closer.
CREATE UNIQUE INDEX "rdv_contacts_owner_email_key" ON "rdv_contacts" (lower("calendly_email"), "owner_user_id");--> statement-breakpoint
CREATE INDEX "rdv_contacts_investor_idx" ON "rdv_contacts" ("investor_id");--> statement-breakpoint
CREATE INDEX "interactions_rdv_contact_idx" ON "interactions" ("rdv_contact_id");--> statement-breakpoint
CREATE INDEX "closer_tasks_rdv_contact_idx" ON "closer_tasks" ("rdv_contact_id");--> statement-breakpoint

-- RLS obligatoire sur toute table (règle n°1). Sans policy = tout accès direct
-- refusé ; l'app passe par le rôle serveur, qui contourne la RLS. Le cloisonnement
-- par closer est aussi vérifié côté code (defense in depth).
ALTER TABLE "calendly_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ENABLE ROW LEVEL SECURITY;
