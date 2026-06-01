CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text,
	"email" text NOT NULL,
	"event" text NOT NULL,
	"subject" text,
	"link" text,
	"tag" text,
	"occurred_at" timestamp with time zone,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
