-- ============================================================================
-- 0004_business_managers.sql — Adds Business Manager scoping.
-- Run this FOURTH in the Supabase SQL Editor (after 0001–0003).
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
-- (Runs safely even if no such users exist)
update public.profiles
  set role = 'super_admin'
  where role = 'admin'
    and business_manager_id is null;

-- g) Assign demo clients to business managers (split evenly for demo purposes)
update public.clients set business_manager_id = 'b0000001-0000-0000-0000-000000000001' where slug = 'funnels';
update public.clients set business_manager_id = 'b0000002-0000-0000-0000-000000000002' where slug = 'shaqir';
update public.clients set business_manager_id = 'b0000002-0000-0000-0000-000000000002' where slug = 'acme';
