-- ============================================================================
-- 0005_rls_bm.sql — Update RLS helpers and policies for Business Manager scoping.
-- Run this FIFTH in the Supabase SQL Editor (after 0004_business_managers.sql).
--
-- Role model after this migration:
--   super_admin — sees all clients across all business managers (null BM on profile)
--   admin/staff — scoped to clients whose business_manager_id matches their profile
--   client      — unchanged (sees only their own client)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is_super_admin() — true when the current user is super_admin.
-- SECURITY DEFINER / pinned search_path for safety.
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
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
      and p.role = 'super_admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: is_staff() — updated to include super_admin so existing callers
-- continue to work without change (super_admin is a superset of staff).
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
      and p.role in ('admin', 'staff', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: current_bm_id() — the business_manager_id from the current user's
-- profile. Returns NULL for super_admin (and for client users, but clients
-- don't reach BM-scoped policies).
-- ---------------------------------------------------------------------------
create or replace function public.current_bm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_manager_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Helper: can_access_client(client_id uuid)
--   true  if the current user is super_admin (sees everything), OR
--         if the user is admin/staff AND the client belongs to their BM.
-- Used by all BM-scoped SELECT policies below.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.is_staff()
      and exists (
        select 1
        from public.clients c
        join public.profiles pr on pr.id = auth.uid()
        where c.id = p_client_id
          and c.business_manager_id = pr.business_manager_id
          and pr.role in ('admin', 'staff')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Helper: current_client_id() — unchanged (used by client-role policies).
-- Recreated here to ensure it stays in sync.
-- ---------------------------------------------------------------------------
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
-- profiles — keep self-read; update staff read policy to cover super_admin
-- (is_staff() already returns true for super_admin after the update above,
-- so these policy bodies are effectively unchanged — but drop+recreate to
-- be explicit and safe to re-run).
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

-- SELECT: super_admin sees all; admin/staff see only their BM's clients;
--         client sees only their own.
drop policy if exists clients_staff_all on public.clients;
drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients
  for select using (public.can_access_client(id));

drop policy if exists clients_client_select on public.clients;
create policy clients_client_select on public.clients
  for select using (id = public.current_client_id());

-- INSERT/UPDATE/DELETE: super_admin anywhere; admin/staff within their BM.
drop policy if exists clients_staff_write on public.clients;
create policy clients_staff_write on public.clients
  for all
  using (
    public.is_super_admin()
    or (
      exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid()
          and pr.role in ('admin', 'staff')
          and (
            clients.business_manager_id = pr.business_manager_id
            or clients.business_manager_id is null
          )
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      exists (
        select 1 from public.profiles pr
        where pr.id = auth.uid()
          and pr.role in ('admin', 'staff')
          and (
            clients.business_manager_id = pr.business_manager_id
            or clients.business_manager_id is null
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- ad_accounts
-- ---------------------------------------------------------------------------
drop policy if exists ad_accounts_staff_all on public.ad_accounts;
drop policy if exists ad_accounts_staff_select on public.ad_accounts;
create policy ad_accounts_staff_select on public.ad_accounts
  for select using (public.can_access_client(client_id));

drop policy if exists ad_accounts_client_select on public.ad_accounts;
create policy ad_accounts_client_select on public.ad_accounts
  for select using (client_id = public.current_client_id());

drop policy if exists ad_accounts_staff_write on public.ad_accounts;
create policy ad_accounts_staff_write on public.ad_accounts
  for all
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- ---------------------------------------------------------------------------
-- metrics_daily
-- ---------------------------------------------------------------------------
drop policy if exists metrics_daily_staff_all on public.metrics_daily;
drop policy if exists metrics_daily_staff_select on public.metrics_daily;
create policy metrics_daily_staff_select on public.metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

drop policy if exists metrics_daily_client_select on public.metrics_daily;
create policy metrics_daily_client_select on public.metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = metrics_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

drop policy if exists metrics_daily_staff_write on public.metrics_daily;
create policy metrics_daily_staff_write on public.metrics_daily
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- campaign_metrics_daily
-- ---------------------------------------------------------------------------
drop policy if exists campaign_metrics_daily_staff_all on public.campaign_metrics_daily;
drop policy if exists campaign_metrics_daily_staff_select on public.campaign_metrics_daily;
create policy campaign_metrics_daily_staff_select on public.campaign_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = campaign_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

drop policy if exists campaign_metrics_daily_client_select on public.campaign_metrics_daily;
create policy campaign_metrics_daily_client_select on public.campaign_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = campaign_metrics_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

drop policy if exists campaign_metrics_daily_staff_write on public.campaign_metrics_daily;
create policy campaign_metrics_daily_staff_write on public.campaign_metrics_daily
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = campaign_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = campaign_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- meta_connections — super_admin or scoped staff; no client access.
-- ---------------------------------------------------------------------------
drop policy if exists meta_connections_staff_all on public.meta_connections;
create policy meta_connections_staff_all on public.meta_connections
  for all
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- ---------------------------------------------------------------------------
-- sync_log — follows the ad_account's client scoping.
-- ---------------------------------------------------------------------------
drop policy if exists sync_log_staff_all on public.sync_log;
create policy sync_log_staff_all on public.sync_log
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = sync_log.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = sync_log.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- business_managers table — enable RLS; super_admin or any staff can read;
-- only super_admin can write.
-- ---------------------------------------------------------------------------
alter table public.business_managers enable row level security;

drop policy if exists bm_staff_select on public.business_managers;
create policy bm_staff_select on public.business_managers
  for select using (public.is_staff());

drop policy if exists bm_super_admin_write on public.business_managers;
create policy bm_super_admin_write on public.business_managers
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
