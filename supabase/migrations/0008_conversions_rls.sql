-- ============================================================================
-- 0008_conversions_rls.sql — RLS for the three conversion tables.
-- Mirrors the metrics_daily / campaign_metrics_daily pattern in 0005:
--   staff (BM-scoped via can_access_client through ad_accounts) SELECT + write
--   client users SELECT rows whose ad_account.client_id = current_client_id()
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tracked_conversions
-- ---------------------------------------------------------------------------
alter table public.tracked_conversions enable row level security;

drop policy if exists tracked_conversions_staff_select on public.tracked_conversions;
create policy tracked_conversions_staff_select on public.tracked_conversions
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = tracked_conversions.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

drop policy if exists tracked_conversions_client_select on public.tracked_conversions;
create policy tracked_conversions_client_select on public.tracked_conversions
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = tracked_conversions.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

drop policy if exists tracked_conversions_staff_write on public.tracked_conversions;
create policy tracked_conversions_staff_write on public.tracked_conversions
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = tracked_conversions.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = tracked_conversions.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- conversion_metrics_daily
-- ---------------------------------------------------------------------------
alter table public.conversion_metrics_daily enable row level security;

drop policy if exists conversion_metrics_daily_staff_select on public.conversion_metrics_daily;
create policy conversion_metrics_daily_staff_select on public.conversion_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

drop policy if exists conversion_metrics_daily_client_select on public.conversion_metrics_daily;
create policy conversion_metrics_daily_client_select on public.conversion_metrics_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

drop policy if exists conversion_metrics_daily_staff_write on public.conversion_metrics_daily;
create policy conversion_metrics_daily_staff_write on public.conversion_metrics_daily
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- conversion_metrics_campaign_daily
-- ---------------------------------------------------------------------------
alter table public.conversion_metrics_campaign_daily enable row level security;

drop policy if exists conversion_metrics_campaign_daily_staff_select on public.conversion_metrics_campaign_daily;
create policy conversion_metrics_campaign_daily_staff_select on public.conversion_metrics_campaign_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_campaign_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );

drop policy if exists conversion_metrics_campaign_daily_client_select on public.conversion_metrics_campaign_daily;
create policy conversion_metrics_campaign_daily_client_select on public.conversion_metrics_campaign_daily
  for select using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_campaign_daily.ad_account_id
        and a.client_id = public.current_client_id()
    )
  );

drop policy if exists conversion_metrics_campaign_daily_staff_write on public.conversion_metrics_campaign_daily;
create policy conversion_metrics_campaign_daily_staff_write on public.conversion_metrics_campaign_daily
  for all
  using (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_campaign_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_accounts a
      where a.id = conversion_metrics_campaign_daily.ad_account_id
        and public.can_access_client(a.client_id)
    )
  );
