-- ============================================================
-- THE PILOT — Row Level Security (RLS)
-- Verrouille chaque table par rôle. Le rôle est lu depuis le JWT
-- Supabase (app_metadata.role). Le service_role (serveur) contourne
-- la RLS pour les opérations système (audit, logs, sync SAH).
--
-- Idempotent : peut être ré-exécuté sans erreur.
-- Matrice de permissions : THE_PILOT.md section 3.
-- ============================================================

-- Helper : rôle de l'utilisateur courant (depuis le JWT)
create or replace function public.auth_role() returns text
  language sql stable
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'none') $$;

-- Helper : un closer est-il propriétaire de cet investisseur ?
-- security definer = contourne la RLS le temps de la vérification (évite la récursion)
create or replace function public.is_my_investor(inv uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists(select 1 from public.investors where id = inv and assigned_closer_id = auth.uid()) $$;

-- ============================================================
-- USERS
-- ============================================================
alter table public.users enable row level security;
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select
  using (id = auth.uid());

-- ============================================================
-- INVESTORS
-- ============================================================
alter table public.investors enable row level security;
drop policy if exists investors_admin_all on public.investors;
create policy investors_admin_all on public.investors for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists investors_exec_read on public.investors;
create policy investors_exec_read on public.investors for select
  using (public.auth_role() = 'executive');
drop policy if exists investors_closer_read on public.investors;
create policy investors_closer_read on public.investors for select
  using (public.auth_role() in ('closer', 'closer_junior') and assigned_closer_id = auth.uid());
drop policy if exists investors_closer_update on public.investors;
create policy investors_closer_update on public.investors for update
  using (public.auth_role() in ('closer', 'closer_junior') and assigned_closer_id = auth.uid())
  with check (public.auth_role() in ('closer', 'closer_junior') and assigned_closer_id = auth.uid());

-- ============================================================
-- PROJECTS (non sensible : lecture pour tous les rôles, écriture admin)
-- ============================================================
alter table public.projects enable row level security;
drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select
  using (public.auth_role() in ('admin', 'closer', 'closer_junior', 'executive'));

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_admin_all on public.subscriptions;
create policy subscriptions_admin_all on public.subscriptions for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists subscriptions_exec_read on public.subscriptions;
create policy subscriptions_exec_read on public.subscriptions for select
  using (public.auth_role() = 'executive');
drop policy if exists subscriptions_closer_read on public.subscriptions;
create policy subscriptions_closer_read on public.subscriptions for select
  using (public.auth_role() in ('closer', 'closer_junior') and public.is_my_investor(investor_id));

-- ============================================================
-- INTERACTIONS
-- ============================================================
alter table public.interactions enable row level security;
drop policy if exists interactions_admin_all on public.interactions;
create policy interactions_admin_all on public.interactions for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists interactions_exec_read on public.interactions;
create policy interactions_exec_read on public.interactions for select
  using (public.auth_role() = 'executive');
drop policy if exists interactions_closer_rw on public.interactions;
create policy interactions_closer_rw on public.interactions for all
  using (public.auth_role() in ('closer', 'closer_junior') and public.is_my_investor(investor_id))
  with check (public.auth_role() in ('closer', 'closer_junior') and public.is_my_investor(investor_id));

-- ============================================================
-- CLOSER_TASKS (rappels/tâches : admin RW, executive lecture, closer sur ses leads)
-- ============================================================
alter table public.closer_tasks enable row level security;
drop policy if exists closer_tasks_admin_all on public.closer_tasks;
create policy closer_tasks_admin_all on public.closer_tasks for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists closer_tasks_exec_read on public.closer_tasks;
create policy closer_tasks_exec_read on public.closer_tasks for select
  using (public.auth_role() = 'executive');
drop policy if exists closer_tasks_closer_rw on public.closer_tasks;
create policy closer_tasks_closer_rw on public.closer_tasks for all
  using (public.auth_role() in ('closer', 'closer_junior') and public.is_my_investor(investor_id))
  with check (public.auth_role() in ('closer', 'closer_junior') and public.is_my_investor(investor_id));

-- ============================================================
-- EMAIL_FLOWS (admin RW, executive lecture)
-- ============================================================
alter table public.email_flows enable row level security;
drop policy if exists email_flows_admin_all on public.email_flows;
create policy email_flows_admin_all on public.email_flows for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists email_flows_exec_read on public.email_flows;
create policy email_flows_exec_read on public.email_flows for select
  using (public.auth_role() = 'executive');

-- ============================================================
-- EMAIL_FLOW_RUNS (admin RW, executive lecture)
-- ============================================================
alter table public.email_flow_runs enable row level security;
drop policy if exists email_flow_runs_admin_all on public.email_flow_runs;
create policy email_flow_runs_admin_all on public.email_flow_runs for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists email_flow_runs_exec_read on public.email_flow_runs;
create policy email_flow_runs_exec_read on public.email_flow_runs for select
  using (public.auth_role() = 'executive');

-- ============================================================
-- AUDIT_LOG (admin lecture seule ; insertion via service_role)
-- ============================================================
alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log for select
  using (public.auth_role() = 'admin');

-- ============================================================
-- LLM_CALLS (admin lecture seule ; insertion via service_role)
-- ============================================================
alter table public.llm_calls enable row level security;
drop policy if exists llm_calls_admin_read on public.llm_calls;
create policy llm_calls_admin_read on public.llm_calls for select
  using (public.auth_role() = 'admin');

-- ============================================================
-- SOCIAL HUB — contenu marketing (pas de PII).
-- admin RW complet, executive lecture. Insertion système via service_role.
-- ============================================================
alter table public.social_context_notes enable row level security;
drop policy if exists social_notes_admin_all on public.social_context_notes;
create policy social_notes_admin_all on public.social_context_notes for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_notes_exec_read on public.social_context_notes;
create policy social_notes_exec_read on public.social_context_notes for select
  using (public.auth_role() = 'executive');

alter table public.social_ideas enable row level security;
drop policy if exists social_ideas_admin_all on public.social_ideas;
create policy social_ideas_admin_all on public.social_ideas for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_ideas_exec_read on public.social_ideas;
create policy social_ideas_exec_read on public.social_ideas for select
  using (public.auth_role() = 'executive');

alter table public.social_posts enable row level security;
drop policy if exists social_posts_admin_all on public.social_posts;
create policy social_posts_admin_all on public.social_posts for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_posts_exec_read on public.social_posts;
create policy social_posts_exec_read on public.social_posts for select
  using (public.auth_role() = 'executive');

alter table public.social_carousel_slides enable row level security;
drop policy if exists social_slides_admin_all on public.social_carousel_slides;
create policy social_slides_admin_all on public.social_carousel_slides for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_slides_exec_read on public.social_carousel_slides;
create policy social_slides_exec_read on public.social_carousel_slides for select
  using (public.auth_role() = 'executive');

alter table public.social_competitor_reports enable row level security;
drop policy if exists social_reports_admin_all on public.social_competitor_reports;
create policy social_reports_admin_all on public.social_competitor_reports for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_reports_exec_read on public.social_competitor_reports;
create policy social_reports_exec_read on public.social_competitor_reports for select
  using (public.auth_role() = 'executive');

alter table public.social_settings enable row level security;
drop policy if exists social_settings_admin_all on public.social_settings;
create policy social_settings_admin_all on public.social_settings for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists social_settings_exec_read on public.social_settings;
create policy social_settings_exec_read on public.social_settings for select
  using (public.auth_role() = 'executive');

-- ============================================================
-- EMAIL EVENTS (analytics email reçus par webhook)
-- Écriture : webhook serveur via service connection (contourne la RLS).
-- Lecture : toute l'équipe. Aucune écriture par les clients authentifiés.
-- ============================================================
alter table public.email_events enable row level security;
drop policy if exists email_events_admin_all on public.email_events;
create policy email_events_admin_all on public.email_events for all
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists email_events_team_read on public.email_events;
create policy email_events_team_read on public.email_events for select
  using (public.auth_role() in ('closer', 'closer_junior', 'executive'));
