ALTER TABLE "investors" ADD COLUMN "pipeline_source" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "pipeline_entered_at" timestamp with time zone;--> statement-breakpoint
-- Rétro-alimentation : les 15 personnes déjà sorties de « Nouveau » ont été
-- appelées avant l'existence du tableau. On leur donne une date d'entrée (celle
-- de leur dernier changement d'étape, à défaut de mieux) pour qu'elles ne
-- s'affichent pas comme entrées le jour de la migration. La file d'origine
-- reste inconnue : on ne l'invente pas.
UPDATE "investors"
SET "pipeline_entered_at" = coalesce("pipeline_stage_updated_at", "updated_at")
WHERE "pipeline_stage" <> 'new' AND "pipeline_entered_at" IS NULL;
