-- ============================================================
-- THE PILOT LEAD — rôle applicatif `app_lead`
--
-- À exécuter UNE fois avec le rôle `postgres` du projet Supabase DÉDIÉ,
-- après la première migration (le schéma `lead` doit exister).
-- Le mot de passe est injecté par scripts/apply-roles.mjs (APP_LEAD_PASSWORD),
-- jamais écrit ici.
--
-- Pourquoi un rôle dédié : le rôle `postgres` de Supabase contourne la RLS.
-- `app_lead` ne la contourne PAS : chaque requête de l'application est filtrée
-- par les politiques de drizzle/policies.sql selon `app.role` / `app.buyer_id`
-- posés par withDbSession(). L'isolation des acheteurs tient à la base.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_lead') then
    create role app_lead login nobypassrls noinherit;
  end if;
end $$;

alter role app_lead with nobypassrls nosuperuser nocreatedb nocreaterole;
alter role app_lead with password :'app_lead_password';

grant usage on schema lead to app_lead;
grant select, insert, update, delete on all tables in schema lead to app_lead;
grant usage, select on all sequences in schema lead to app_lead;
grant execute on all functions in schema lead to app_lead;

-- Les tables créées par les migrations futures (rôle postgres) héritent des droits.
alter default privileges for role postgres in schema lead
  grant select, insert, update, delete on tables to app_lead;
alter default privileges for role postgres in schema lead
  grant usage, select on sequences to app_lead;
alter default privileges for role postgres in schema lead
  grant execute on functions to app_lead;

-- Rien en dehors du schéma lead (les objets Supabase restent hors de portée).
revoke all on schema public from app_lead;
