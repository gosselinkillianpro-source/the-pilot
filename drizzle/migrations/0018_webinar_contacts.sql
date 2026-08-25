CREATE TYPE "public"."contact_source" AS ENUM('calendly', 'webinar', 'manuel');--> statement-breakpoint
ALTER TABLE "rdv_contacts" DROP CONSTRAINT "rdv_contacts_owner_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rdv_contacts" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD COLUMN "source" "contact_source" DEFAULT 'calendly' NOT NULL;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD CONSTRAINT "rdv_contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;