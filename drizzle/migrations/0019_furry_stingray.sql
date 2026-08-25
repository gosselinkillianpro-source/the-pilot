CREATE TYPE "public"."contact_stage" AS ENUM('taken', 'called', 'interested', 'account_ready', 'invested', 'lost');--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD COLUMN "pipeline_stage" "contact_stage";--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD COLUMN "pipeline_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rdv_contacts" ADD COLUMN "pipeline_stage_updated_at" timestamp with time zone;--> statement-breakpoint
-- Rétro-alimentation du tableau de suivi.
--
-- 356 appels ont déjà été enregistrés avant l'existence du kanban. Démarrer le
-- tableau vide donnerait l'impression que rien n'a été fait : on y replace donc
-- les inscrits webinaire sur lesquels un closer a déjà travaillé.
--   · un appel loggé  → colonne « Appelé »
--   · une fiche prise → colonne « Pris en charge »
-- La date d'entrée est celle du premier signe de travail, pas celle de la
-- migration : le temps de parcours reste juste.
UPDATE "rdv_contacts" c
SET "pipeline_stage" = 'called',
    "pipeline_entered_at" = w.first_call,
    "pipeline_stage_updated_at" = w.last_call
FROM (
  SELECT c2.id, min(ix.created_at) AS first_call, max(ix.created_at) AS last_call
  FROM "rdv_contacts" c2
  JOIN "interactions" ix
    ON ix."rdv_contact_id" = c2.id
    OR (c2."investor_id" IS NOT NULL AND ix."investor_id" = c2."investor_id")
  WHERE c2."source" = 'webinar'
    AND ix."type" IN ('call_outbound', 'call_inbound')
  GROUP BY c2.id
) w
WHERE c.id = w.id AND c."pipeline_stage" IS NULL;--> statement-breakpoint
UPDATE "rdv_contacts"
SET "pipeline_stage" = 'taken',
    "pipeline_entered_at" = "updated_at",
    "pipeline_stage_updated_at" = "updated_at"
WHERE "source" = 'webinar' AND "owner_user_id" IS NOT NULL AND "pipeline_stage" IS NULL;
