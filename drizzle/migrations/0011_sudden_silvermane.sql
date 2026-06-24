ALTER TYPE "public"."user_role" ADD VALUE 'admin_affiliate';--> statement-breakpoint
CREATE TABLE "affiliate_network" (
	"investor_id" uuid NOT NULL,
	"owner_sah_id" text NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "affiliate_network_investor_id_owner_sah_id_pk" PRIMARY KEY("investor_id","owner_sah_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sah_user_id" text;--> statement-breakpoint
ALTER TABLE "affiliate_network" ADD CONSTRAINT "affiliate_network_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_network_owner_idx" ON "affiliate_network" USING btree ("owner_sah_id");