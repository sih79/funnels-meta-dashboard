-- ============================================================================
-- 0002_rls.sql — Row-Level Security policies.
-- Run this SECOND in the Supabase SQL Editor (after 0001_init.sql).
--
-- Model: Admin/Staff see EVERYTHING. A 'client' user sees ONLY rows belonging
-- to their own profiles.client_id. Clients have NO write access.
--
-- The service-role key (used by the background sync job) BYPASSES RLS
-- automatically — these policies do not constrain it. Only the anon/auth
-- keys go through the checks below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is_staff() — true when the current user is admin or staff.
-- SECURITY DEFINER so it can read profiles without tripping profiles' own RLS
-- (which would otherwise recurse). search_path is pinned for safety.
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'staff')
  );
$$;

-- Helper: the client_id of the currently logged-in user (null for staff).
create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.clients                enable row level security;
alter table public.ad_accounts            enable row level security;
alter table public.metrics_daily          enable row level security;
alter table public.campaign_metrics_daily enable row level security;
alter table public.meta_connections       enable row level security;
alter table public.sync_log               enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: a user can read their OWN profile; staff can read all.
-- (Writes to role/client_id are intentionally NOT granted to end users —
-- promote users via the service role / SQL editor. See SETUP.md.)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
drop policy if exists clients_staff_all on public.clients;
create policy clients_staff_all on public.clients
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists clients_client_select on public.clients;
create policy clients_client_select on public.clients
  for select using (id = public.current_client_id());

-- ---------------------------------------------------------------------------
-- ad_accounts
-- ---------------------------------------------------------------------------
drop policy if exists ad_accounts_staff_all on public.ad_accounts;
create policy ad_accounts_staff_all on public.ad_accounts
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists ad_accounts_client_select on public.ad_accounts;
create policy ad_accounts_client_select on public.ad_accounts
  for select using (client_id = public.current_client_id());

-- ---------------------------------------------------------------------------
-- metrics_daily — client may SELECT rows whose ad_account belongs to them.
-- ---------------------------------------------------------------------------
drop policy if exists metrics_daily_staff_all on public.metrics_daily;
create policy metrics_daily_staff_all on public.metrics_daily
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists metrics_daily_client_select on public.metrics_daily;
create policy metrics_daily_client_select on public.metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = metrics_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- campaign_metrics_daily — same join-based client read access.
-- ---------------------------------------------------------------------------
drop policy if exists campaign_metrics_daily_staff_all on public.campaign_metrics_daily;
create policy campaign_metrics_daily_staff_all on public.campaign_metrics_daily
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists campaign_metrics_daily_client_select on public.campaign_metrics_daily;
create policy campaign_metrics_daily_client_select on public.campaign_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = campaign_metrics_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- meta_connections — staff only (holds secret tokens). No client access.
-- ---------------------------------------------------------------------------
drop policy if exists meta_connections_staff_all on public.meta_connections;
create policy meta_connections_staff_all on public.meta_connections
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- sync_log — staff only.
-- ---------------------------------------------------------------------------
drop policy if exists sync_log_staff_all on public.sync_log;
create policy sync_log_staff_all on public.sync_log
  for all using (public.is_staff()) with check (public.is_staff());
