-- ============================================================================
-- 0007_conversions.sql — Per-ad-account custom conversion picker.
-- Run AFTER 0006. Creates the tracked_conversions registry plus the per-day
-- and per-campaign breakdown tables that the sync robot populates.
-- ============================================================================

-- One row per (ad_account_id, action_type). Auto-populated by sync; admin
-- ticks is_enabled to surface it in the dashboard + renames it.
create table if not exists public.tracked_conversions (
  id                    uuid primary key default gen_random_uuid(),
  ad_account_id         uuid not null references public.ad_accounts(id) on delete cascade,
  action_type           text not null,
  display_name          text not null,
  is_enabled            boolean not null default false,
  display_order         int not null default 0,
  custom_conversion_id  text,       -- nullable; set when discovered via /customconversions
  meta_name             text,       -- raw Meta name (for picker reference)
  first_seen_at         timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (ad_account_id, action_type)
);

create index if not exists tracked_conversions_account_idx
  on public.tracked_conversions (ad_account_id);

-- Per-day counts for every action_type seen (admin-enabled or not).
create table if not exists public.conversion_metrics_daily (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  action_type   text not null,
  date          date not null,
  count         int not null default 0,
  value         numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, action_type, date)
);

create index if not exists conversion_metrics_daily_account_date_idx
  on public.conversion_metrics_daily (ad_account_id, date);

-- Optional per-campaign breakdown — same shape but per campaign.
create table if not exists public.conversion_metrics_campaign_daily (
  id            uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  campaign_id   text not null,
  action_type   text not null,
  date          date not null,
  count         int not null default 0,
  value         numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (ad_account_id, campaign_id, action_type, date)
);

create index if not exists conversion_metrics_campaign_daily_idx
  on public.conversion_metrics_campaign_daily (ad_account_id, campaign_id, date);
