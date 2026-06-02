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
