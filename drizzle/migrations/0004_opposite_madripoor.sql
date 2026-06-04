ALTER TABLE "investors" ADD COLUMN "civility" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "country_residence" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "address_street" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "address_complement" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "tax_residency_country" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "bonus_code" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "cgp_name" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "cgp_network" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "wallet_balance_cents" integer;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "wallet_status" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "lw_onboarding_status" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "lw_onboarding_id" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "lemonway_account_id" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "kyc_validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "sah_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "sah_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "shares_count" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp with time zone;