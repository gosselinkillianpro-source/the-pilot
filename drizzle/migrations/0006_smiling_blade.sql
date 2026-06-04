ALTER TABLE "investors" ADD COLUMN "claimed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_claimed_by_id_users_id_fk" FOREIGN KEY ("claimed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;