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
