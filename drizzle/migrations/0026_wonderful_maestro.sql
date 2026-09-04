CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "closer_tasks_closer_status_idx" ON "closer_tasks" USING btree ("closer_id","status","due_at");--> statement-breakpoint
CREATE INDEX "closer_tasks_investor_idx" ON "closer_tasks" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "interactions_investor_created_idx" ON "interactions" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "investors_email_lower_idx" ON "investors" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "investors_sah_created_idx" ON "investors" USING btree ("sah_created_at");--> statement-breakpoint
CREATE INDEX "investors_assigned_closer_idx" ON "investors" USING btree ("assigned_closer_id");--> statement-breakpoint
CREATE INDEX "investors_pipeline_stage_idx" ON "investors" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX "subscriptions_investor_idx" ON "subscriptions" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "subscriptions_signed_at_idx" ON "subscriptions" USING btree ("signed_at");