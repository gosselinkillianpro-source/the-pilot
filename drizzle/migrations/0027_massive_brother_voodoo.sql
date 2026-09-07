CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" NOT NULL,
	"sah_user_id" text,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "assignment_source" text;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_invitations_email_lower_idx" ON "user_invitations" USING btree (lower("email"));--> statement-breakpoint
-- Rattrapage : les personnes déjà suivies ont été attribuées à leur premier
-- résultat enregistré (propriété collante). On date l'attribution de la
-- première interaction du closer, sinon de la dernière mise à jour connue.
UPDATE "investors" i SET
  "assigned_at" = COALESCE(
    (SELECT min(ix.created_at) FROM "interactions" ix
      WHERE ix.investor_id = i.id AND ix.user_id = i.assigned_closer_id),
    i.updated_at
  ),
  "assignment_source" = 'call'
WHERE i.assigned_closer_id IS NOT NULL AND i.assigned_at IS NULL;
