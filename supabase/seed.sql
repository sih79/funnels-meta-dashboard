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
