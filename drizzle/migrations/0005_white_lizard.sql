CREATE TYPE "public"."call_outcome" AS ENUM('reached', 'no_answer', 'voicemail', 'wrong_number', 'callback_scheduled');--> statement-breakpoint
CREATE TYPE "public"."closer_task_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "closer_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"closer_id" uuid,
	"type" text DEFAULT 'callback' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"note" text,
	"status" "closer_task_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "outcome" "call_outcome";--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD CONSTRAINT "closer_tasks_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD CONSTRAINT "closer_tasks_closer_id_users_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_tasks" ADD CONSTRAINT "closer_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;