CREATE TYPE "public"."social_idea_category" AS ENUM('projets', 'pedagogique', 'temoignages', 'mise_avant');--> statement-breakpoint
CREATE TYPE "public"."social_idea_status" AS ENUM('pending', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('facebook', 'instagram', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('draft', 'ready', 'published');--> statement-breakpoint
CREATE TABLE "social_carousel_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"slide_index" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"extra" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_competitor_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor" text NOT NULL,
	"report" jsonb NOT NULL,
	"week_start" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_context_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"angle" text NOT NULL,
	"rationale" text,
	"category" "social_idea_category",
	"status" "social_idea_status" DEFAULT 'pending' NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"source_research" text,
	"from_competitor" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid,
	"project_id" uuid,
	"platform" "social_platform" NOT NULL,
	"text" text NOT NULL,
	"is_carousel" boolean DEFAULT false NOT NULL,
	"no_image" boolean DEFAULT true NOT NULL,
	"image_path" text,
	"image_prompt" text,
	"scheduled_date" text,
	"scheduled_time" text,
	"status" "social_post_status" DEFAULT 'draft' NOT NULL,
	"amf_passed" boolean,
	"amf_issues" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_carousel_slides" ADD CONSTRAINT "social_carousel_slides_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_context_notes" ADD CONSTRAINT "social_context_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_ideas" ADD CONSTRAINT "social_ideas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_idea_id_social_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."social_ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;