-- COMBINED SETUP — paste this whole file into Supabase SQL Editor and Run.
-- Order: schema, security, profile trigger, demo seed.


-- ============ 0001_init.sql ============
-- ============================================================================
-- 0001_init.sql — Core schema for the multi-client Meta Ads dashboard.
-- Run this FIRST in the Supabase SQL Editor (before 0002_rls.sql and seed.sql).
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto. It's available by default on Supabase,
-- but enable it explicitly so this migration is self-contained.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'staff', 'client');
  end if;
  if not exists (select 1 from pg_type where typname = 'account_source') then
    create type account_source as enum ('agency', 'client_oauth');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- clients — one row per agency client (the people whose ads we report on).
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users with role + client membership.
-- One profile per auth user. role defaults to 'client' (least privilege).
-- client_id links a client-role user to the single client they may view.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role not null default 'client',
  client_id   uuid references public.clients (id) on delete set null,
  full_name   text,
  created_at  timestamptz not null default now()
);

create index if not exists profiles_client_id_idx on public.profiles (client_id);

-- ---------------------------------------------------------------------------
-- ad_accounts — Meta ad accounts, each belonging to one client.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_accounts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  meta_account_id text not null unique,           -- e.g. 'act_1234567890'
  name            text not null,
  source          account_source not null default 'agency',
  currency        text not null default 'GBP',
  status          text not null default 'active',
  created_at      timestamptz not null default now()
);

create index if not exists ad_accounts_client_id_idx on public.ad_accounts (client_id);

-- ---------------------------------------------------------------------------
-- metrics_daily — one row per ad account per day (account-level rollup).
-- Columns mirror DailyMetric in src/lib/types.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.metrics_daily (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  date          date not null,
  spend         numeric not null default 0,
  clicks        integer not null default 0,
  impressions   bigint  not null default 0,
  reach         bigint  not null default 0,
  leads         integer not null default 0,
  schedules     integer not null default 0,
  revenue       numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, date)
);

create index if not exists metrics_daily_account_date_idx
  on public.metrics_daily (ad_account_id, date);

-- ---------------------------------------------------------------------------
-- campaign_metrics_daily — one row per campaign per day.
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_metrics_daily (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  campaign_id   text not null,
  campaign_name text not null,
  status        text not null default 'active',
  date          date not null,
  spend         numeric not null default 0,
  clicks        integer not null default 0,
  impressions   bigint  not null default 0,
  reach         bigint  not null default 0,
  leads         integer not null default 0,
  schedules     integer not null default 0,
  revenue       numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, campaign_id, date)
);

create index if not exists campaign_metrics_daily_account_date_idx
  on public.campaign_metrics_daily (ad_account_id, date);

-- ---------------------------------------------------------------------------
-- meta_connections — encrypted client OAuth tokens (used in Phase 6).
-- access_token_encrypted is ciphertext; the app encrypts before insert.
-- ---------------------------------------------------------------------------
create table if not exists public.meta_connections (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  ad_account_id          uuid references public.ad_accounts (id) on delete set null,
  access_token_encrypted text not null,
  token_expires_at       timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists meta_connections_client_id_idx
  on public.meta_connections (client_id);

-- ---------------------------------------------------------------------------
-- sync_log — audit trail for each background sync run.
-- ---------------------------------------------------------------------------
create table if not exists public.sync_log (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts (id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running',  -- 'running' | 'success' | 'error'
  rows_written  integer not null default 0,
  error         text
);

create index if not exists sync_log_account_started_idx
  on public.sync_log (ad_account_id, started_at desc);

-- ============ 0002_rls.sql ============
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

-- ============ 0003_profile_trigger.sql ============
-- ============================================================================
-- 0003_profile_trigger.sql — Auto-create a profile row for every new auth user.
-- Run this THIRD in the Supabase SQL Editor (after 0001_init.sql and 0002_rls.sql).
--
-- Why: when someone signs up / is created in Supabase Auth, they get a row in
-- the hidden `auth.users` table — but our app reads `public.profiles` for the
-- user's role and client_id. Without this trigger a brand-new login would have
-- NO profile row, so role lookups (is_staff(), requireStaff(), etc.) would fail.
--
-- This trigger fires AFTER each insert into auth.users and creates the matching
-- profiles row with a sensible default: role = 'client' (least privilege).
-- Promote trusted users to 'admin'/'staff' afterwards (see SETUP.md Step 5).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- handle_new_user() — copies the new auth user into public.profiles.
--
-- SECURITY DEFINER so it runs as the function owner and can write to
-- public.profiles regardless of the inserting role / RLS. search_path is
-- pinned to public for safety (prevents search_path hijacking).
--
-- full_name is pulled from the optional raw_user_meta_data->>'full_name' that
-- the sign-up form may pass; null when absent.
--
-- The insert is idempotent (on conflict do nothing) so re-running or a manual
-- pre-existing profile row never causes the auth insert to fail.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'client',
    nullif(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: fire handle_new_user() after every new auth.users row.
-- Dropped first so this migration is safe to re-run.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============ seed.sql ============
-- ============================================================================
-- seed.sql — DEMO SEED DATA. Safe to run in the Supabase SQL Editor after the
-- two migrations. Everything here is FAKE, made-up data purely so the
-- dashboard has something to show before real Meta syncing is wired up.
-- Re-running is safe (idempotent via ON CONFLICT).
-- ============================================================================

-- ---- Demo clients ----------------------------------------------------------
insert into public.clients (id, name, slug, logo_url) values
  ('11111111-1111-1111-1111-111111111111', 'Funnels.com',        'funnels',     null),
  ('22222222-2222-2222-2222-222222222222', 'Shaqir Hussyin',     'shaqir',      null),
  ('33333333-3333-3333-3333-333333333333', 'Acme Coaching',      'acme',        null)
on conflict (id) do nothing;

-- ---- One ad account per demo client ----------------------------------------
insert into public.ad_accounts (id, client_id, meta_account_id, name, source, currency, status) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'act_1000000001', 'Funnels.com — Main',     'agency', 'GBP', 'active'),
  ('aaaaaaa2-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'act_2000000002', 'Shaqir Hussyin — Brand',  'agency', 'GBP', 'active'),
  ('aaaaaaa3-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'act_3000000003', 'Acme Coaching — Leads',   'agency', 'GBP', 'active')
on conflict (meta_account_id) do nothing;

-- ---- ~30 days of account-level metrics for the Funnels.com account ---------
-- Deterministic, plausible numbers generated from the day offset. No RNG so
-- the data is identical on every run.
insert into public.metrics_daily
  (ad_account_id, date, spend, clicks, impressions, reach, leads, schedules, revenue)
select
  'aaaaaaa1-0000-0000-0000-000000000001'::uuid,
  (current_date - g)::date                                    as date,
  round((180 + (g * 7) % 90 + (g % 5) * 12)::numeric, 2)      as spend,
  (240 + (g * 11) % 160)                                      as clicks,
  (18000 + (g * 313) % 9000)                                  as impressions,
  (12000 + (g * 211) % 6000)                                  as reach,
  (22 + (g * 3) % 18)                                         as leads,
  (5 + (g * 2) % 9)                                           as schedules,
  round((900 + (g * 37) % 700 + (g % 4) * 150)::numeric, 2)   as revenue
from generate_series(0, 29) as g
on conflict (ad_account_id, date) do nothing;

-- ---- A few campaign-level rows for the most recent day (demo) --------------
insert into public.campaign_metrics_daily
  (ad_account_id, campaign_id, campaign_name, status, date, spend, clicks, impressions, reach, leads, schedules, revenue)
values
  ('aaaaaaa1-0000-0000-0000-000000000001', 'class',  'Class Registration', 'active', current_date, 62.40, 88, 6200, 4100, 9, 3, 420.00),
  ('aaaaaaa1-0000-0000-0000-000000000001', 'audit',  'Free Funnel Audit',  'active', current_date, 48.10, 71, 5100, 3300, 7, 2, 360.00),
  ('aaaaaaa1-0000-0000-0000-000000000001', 'agency', 'Agency Retainer',    'active', current_date, 39.80, 54, 4000, 2600, 5, 2, 300.00),
  ('aaaaaaa1-0000-0000-0000-000000000001', 'cbt',    'CBT Webinar',        'paused', current_date, 21.30, 33, 2700, 1800, 3, 1, 150.00)
on conflict (ad_account_id, campaign_id, date) do nothing;

-- ============ 0004_business_managers.sql ============
-- ============================================================================
-- 0004_business_managers.sql — Adds Business Manager scoping.
-- ============================================================================

-- a) Create business_managers table
create table if not exists public.business_managers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- b) Add business_manager_id to clients (nullable — existing clients unaffected until assigned)
alter table public.clients
  add column if not exists business_manager_id uuid references public.business_managers(id) on delete set null;

-- c) Add 'super_admin' value to user_role enum
alter type public.user_role add value if not exists 'super_admin';

-- d) Add business_manager_id to profiles (nullable — super_admin has null = sees all)
alter table public.profiles
  add column if not exists business_manager_id uuid references public.business_managers(id) on delete set null;

-- e) Seed the two initial business managers
insert into public.business_managers (id, name, slug) values
  ('b0000001-0000-0000-0000-000000000001', 'Simon Hearn''s Business', 'simon-hearn'),
  ('b0000002-0000-0000-0000-000000000002', 'SH ACQ', 'sh-acq')
on conflict (slug) do nothing;

-- f) Auto-promote: existing admins with no BM assigned become super_admin
update public.profiles
  set role = 'super_admin'
  where role = 'admin'
    and business_manager_id is null;

-- g) Assign demo clients to business managers
update public.clients set business_manager_id = 'b0000001-0000-0000-0000-000000000001' where slug = 'funnels';
update public.clients set business_manager_id = 'b0000002-0000-0000-0000-000000000002' where slug = 'shaqir';
update public.clients set business_manager_id = 'b0000002-0000-0000-0000-000000000002' where slug = 'acme';

-- ============ 0005_rls_bm.sql ============
-- ============================================================================
-- 0005_rls_bm.sql — Update RLS helpers and policies for Business Manager scoping.
-- ============================================================================

-- Helper: is_super_admin()
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

-- Helper: is_staff() — updated to include super_admin
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

-- Helper: current_bm_id()
create or replace function public.current_bm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_manager_id from public.profiles where id = auth.uid();
$$;

-- Helper: can_access_client(client_id uuid)
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

-- Helper: current_client_id() — unchanged
create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- profiles
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());

-- clients
drop policy if exists clients_staff_all on public.clients;
drop policy if exists clients_staff_select on public.clients;
create policy clients_staff_select on public.clients
  for select using (public.can_access_client(id));

drop policy if exists clients_client_select on public.clients;
create policy clients_client_select on public.clients
  for select using (id = public.current_client_id());

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

-- ad_accounts
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

-- metrics_daily
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

-- campaign_metrics_daily
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

-- meta_connections
drop policy if exists meta_connections_staff_all on public.meta_connections;
create policy meta_connections_staff_all on public.meta_connections
  for all
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

-- sync_log
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

-- business_managers
alter table public.business_managers enable row level security;

drop policy if exists bm_staff_select on public.business_managers;
create policy bm_staff_select on public.business_managers
  for select using (public.is_staff());

drop policy if exists bm_super_admin_write on public.business_managers;
create policy bm_super_admin_write on public.business_managers
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
