ALTER TABLE "investors" ADD COLUMN "new_lead_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;