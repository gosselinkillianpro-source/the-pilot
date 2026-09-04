-- ============================================================
-- THE PILOT LEAD — Row Level Security sur le schéma `lead`
--
-- Le rôle applicatif `app_lead` n'a aucun bypass : ces politiques sont LA
-- barrière. Le périmètre de la requête est lu dans des variables de session
-- posées par withDbSession() (set_config(…, true) = portée transaction) :
--   app.role       : admin | setter | buyer | system
--   app.buyer_id   : uuid de l'acheteur (rôle buyer)
--   app.user_id    : uuid de l'utilisateur
--   app.source_ids : JSON array d'uuid (rôle setter)
--
-- Un acheteur qui devine l'identifiant d'un rendez-vous d'un autre acheteur
-- n'obtient AUCUNE ligne : le code répond 404, jamais 403.
--
-- Idempotent : peut être ré-exécuté sans erreur.
-- ============================================================

create or replace function lead.app_role() returns text
  language sql stable
  as $$ select coalesce(nullif(current_setting('app.role', true), ''), 'none') $$;

create or replace function lead.app_buyer_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.buyer_id', true), '')::uuid $$;

create or replace function lead.app_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function lead.app_source_ids() returns uuid[]
  language sql stable
  as $$
    select coalesce(
      (select array_agg(x::uuid)
         from jsonb_array_elements_text(
           coalesce(nullif(current_setting('app.source_ids', true), ''), '[]')::jsonb
         ) as x),
      '{}'::uuid[]
    )
  $$;

create or replace function lead.is_staff() returns boolean
  language sql stable
  as $$ select lead.app_role() in ('admin', 'setter', 'system') $$;

-- Un setter est-il autorisé sur cette source ? (admin et system : toujours)
create or replace function lead.can_access_source(src uuid) returns boolean
  language sql stable
  as $$
    select lead.app_role() in ('admin', 'system')
        or (lead.app_role() = 'setter' and src = any(lead.app_source_ids()))
  $$;

-- ------------------------------------------------------------
-- 1. RLS activée ET forcée sur TOUTES les tables du schéma, sans exception.
-- ------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'lead' loop
    execute format('alter table lead.%I enable row level security', t.tablename);
    execute format('alter table lead.%I force row level security', t.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Admin et system : accès complet à toutes les tables.
-- ------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'lead' loop
    execute format('drop policy if exists admin_all on lead.%I', t.tablename);
    execute format(
      'create policy admin_all on lead.%I for all using (lead.app_role() in (''admin'',''system'')) with check (lead.app_role() in (''admin'',''system''))',
      t.tablename
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Setter : les données de SES sources.
-- ------------------------------------------------------------
drop policy if exists setter_sources on lead.sources;
create policy setter_sources on lead.sources for select
  using (lead.app_role() = 'setter' and id = any(lead.app_source_ids()));

drop policy if exists setter_campaigns on lead.campaigns;
create policy setter_campaigns on lead.campaigns for all
  using (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()))
  with check (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()));

drop policy if exists setter_leads on lead.leads;
create policy setter_leads on lead.leads for all
  using (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()))
  with check (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()));

drop policy if exists setter_buyers on lead.buyers;
create policy setter_buyers on lead.buyers for select
  using (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()));

-- Tables rattachées à un lead : via la source du lead.
drop policy if exists setter_lead_events on lead.lead_events;
create policy setter_lead_events on lead.lead_events for all
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())))
  with check (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())));

drop policy if exists setter_call_attempts on lead.call_attempts;
create policy setter_call_attempts on lead.call_attempts for all
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())))
  with check (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())));

drop policy if exists setter_qualifications on lead.qualifications;
create policy setter_qualifications on lead.qualifications for all
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())))
  with check (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())));

drop policy if exists setter_appointments on lead.appointments;
create policy setter_appointments on lead.appointments for all
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())))
  with check (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())));

drop policy if exists setter_packs on lead.packs;
create policy setter_packs on lead.packs for select
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.buyers b where b.id = buyer_id and b.source_id = any(lead.app_source_ids())));

drop policy if exists setter_conversion_events on lead.conversion_events;
create policy setter_conversion_events on lead.conversion_events for all
  using (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())))
  with check (lead.app_role() = 'setter' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.source_id = any(lead.app_source_ids())));

drop policy if exists setter_notifications on lead.notifications;
create policy setter_notifications on lead.notifications for all
  using (lead.app_role() = 'setter')
  with check (lead.app_role() = 'setter');

drop policy if exists setter_jobs on lead.jobs;
create policy setter_jobs on lead.jobs for all
  using (lead.app_role() = 'setter')
  with check (lead.app_role() = 'setter');

drop policy if exists setter_signed_links on lead.signed_links;
create policy setter_signed_links on lead.signed_links for all
  using (lead.app_role() = 'setter')
  with check (lead.app_role() = 'setter');

drop policy if exists setter_settings on lead.settings;
create policy setter_settings on lead.settings for select
  using (lead.app_role() = 'setter');

drop policy if exists setter_weekly_metrics on lead.weekly_metrics;
create policy setter_weekly_metrics on lead.weekly_metrics for select
  using (lead.app_role() = 'setter' and source_id = any(lead.app_source_ids()));

-- ------------------------------------------------------------
-- 4. Acheteur : UNIQUEMENT ses lignes (buyer_id = app.buyer_id).
-- ------------------------------------------------------------
drop policy if exists buyer_own on lead.buyers;
create policy buyer_own on lead.buyers for select
  using (lead.app_role() = 'buyer' and id = lead.app_buyer_id());

drop policy if exists buyer_own_update on lead.buyers;
create policy buyer_own_update on lead.buyers for update
  using (lead.app_role() = 'buyer' and id = lead.app_buyer_id())
  with check (lead.app_role() = 'buyer' and id = lead.app_buyer_id());

drop policy if exists buyer_users_own on lead.buyer_users;
create policy buyer_users_own on lead.buyer_users for all
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id())
  with check (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_appointments on lead.appointments;
create policy buyer_appointments on lead.appointments for select
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_appointments_update on lead.appointments;
create policy buyer_appointments_update on lead.appointments for update
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id())
  with check (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_packs on lead.packs;
create policy buyer_packs on lead.packs for select
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_invoices on lead.invoices;
create policy buyer_invoices on lead.invoices for select
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_invoice_lines on lead.invoice_lines;
create policy buyer_invoice_lines on lead.invoice_lines for select
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

drop policy if exists buyer_calendly on lead.calendly_connections;
create policy buyer_calendly on lead.calendly_connections for all
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id())
  with check (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

-- Les leads qui lui ont été routés (le code ne sélectionne que les colonnes utiles au RDV).
drop policy if exists buyer_leads on lead.leads;
create policy buyer_leads on lead.leads for select
  using (lead.app_role() = 'buyer' and buyer_id = lead.app_buyer_id());

-- Il journalise ses validations, et ne lit que l'historique de ses leads.
drop policy if exists buyer_lead_events on lead.lead_events;
create policy buyer_lead_events on lead.lead_events for all
  using (lead.app_role() = 'buyer' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.buyer_id = lead.app_buyer_id()))
  with check (lead.app_role() = 'buyer' and exists (
    select 1 from lead.leads l where l.id = lead_id and l.buyer_id = lead.app_buyer_id()));

-- Ses validations déclenchent des jobs (CAPI, pack) et des notifications.
drop policy if exists buyer_jobs on lead.jobs;
create policy buyer_jobs on lead.jobs for insert
  with check (lead.app_role() = 'buyer');

drop policy if exists buyer_notifications on lead.notifications;
create policy buyer_notifications on lead.notifications for insert
  with check (lead.app_role() = 'buyer');

-- ------------------------------------------------------------
-- 5. Tout le monde : sa propre fiche utilisateur, et l'écriture de l'audit.
-- ------------------------------------------------------------
drop policy if exists users_self on lead.users;
create policy users_self on lead.users for select
  using (id = lead.app_user_id());

drop policy if exists users_self_update on lead.users;
create policy users_self_update on lead.users for update
  using (id = lead.app_user_id())
  with check (id = lead.app_user_id());

drop policy if exists audit_insert on lead.audit_log;
create policy audit_insert on lead.audit_log for insert
  with check (lead.app_role() in ('admin', 'setter', 'buyer', 'system'));
