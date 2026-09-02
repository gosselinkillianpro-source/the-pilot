CREATE TABLE "ad_fixed_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"label" text NOT NULL,
	"amount_eur" numeric(12, 2) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_fixed_costs" ADD CONSTRAINT "ad_fixed_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_fixed_costs_month_idx" ON "ad_fixed_costs" USING btree ("month");