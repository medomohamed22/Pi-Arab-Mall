-- Deal Way schema + admin review setup
-- Run this in Supabase SQL Editor.
-- Safe to run more than once, including over older versions of the admins table.

alter table if exists public.products add column if not exists price_usd numeric;
alter table if exists public.products add column if not exists price_pi_snapshot numeric;
alter table if exists public.products add column if not exists pi_usd_snapshot numeric;
alter table if exists public.products add column if not exists condition text default 'used';
alter table if exists public.products add column if not exists status text default 'pending';
alter table if exists public.products add column if not exists reviewed_by text;
alter table if exists public.products add column if not exists reviewed_at timestamptz;
alter table if exists public.products add column if not exists updated_at timestamptz default now();

do $$
begin
  if to_regclass('public.products') is not null then
    update public.products set status = 'pending' where status is null;
  end if;
end $$;

create table if not exists public.admins (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

alter table public.admins add column if not exists email text;
alter table public.admins add column if not exists auth_user_id uuid;
alter table public.admins add column if not exists username text;
alter table public.admins add column if not exists created_at timestamptz default now();

-- Older versions used pi_id as a required admin identifier.
-- The new admin login uses Supabase Auth email/password, so pi_id must not block email-based inserts.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admins' and column_name = 'pi_id'
  ) then
    execute 'alter table public.admins alter column pi_id drop not null';
    update public.admins
    set pi_id = coalesce(pi_id, email, auth_user_id::text, id::text)
    where pi_id is null;
  end if;
end $$;

create unique index if not exists admins_email_unique on public.admins (lower(email)) where email is not null;
create unique index if not exists admins_auth_user_id_unique on public.admins (auth_user_id) where auth_user_id is not null;

-- Add your Supabase Auth admin email safely, whether your admins table is old or new.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admins' and column_name = 'pi_id'
  ) then
    insert into public.admins (pi_id, email, username)
    values ('medomohamed250@gmail.com', 'medomohamed250@gmail.com', 'Admin')
    on conflict do nothing;
  else
    insert into public.admins (email, username)
    values ('medomohamed250@gmail.com', 'Admin')
    on conflict do nothing;
  end if;
end $$;

create table if not exists public.favorites (
  id bigserial primary key,
  user_pi_id text not null,
  product_id bigint not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_pi_id, product_id)
);

create table if not exists public.ratings (
  id bigserial primary key,
  seller_pi_id text not null,
  rater_pi_id text not null,
  product_id bigint references public.products(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(seller_pi_id, rater_pi_id, product_id)
);

create table if not exists public.reports (
  id bigserial primary key,
  reporter_pi_id text not null,
  product_id bigint references public.products(id) on delete cascade,
  reported_user_pi_id text,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_actions add column if not exists admin_email text;
alter table public.admin_actions add column if not exists action text;
alter table public.admin_actions add column if not exists target_type text;
alter table public.admin_actions add column if not exists target_id text;
alter table public.admin_actions add column if not exists note text;

create index if not exists idx_products_seller on public.products(seller_pi_id);
create index if not exists idx_products_status_created on public.products(status, created_at desc);
create index if not exists idx_favorites_user on public.favorites(user_pi_id);
create index if not exists idx_ratings_seller on public.ratings(seller_pi_id);
create index if not exists idx_reports_status on public.reports(status, created_at desc);
create index if not exists idx_admins_email on public.admins(email);

alter table public.admins enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
for select
using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Optional product RLS. Enable only when your public read path is ready for RLS.
-- Admin review actions use api/admin.js with SUPABASE_SERVICE_ROLE_KEY.
-- alter table public.products enable row level security;
-- drop policy if exists products_public_read_active on public.products;
-- create policy products_public_read_active on public.products
-- for select using (coalesce(status,'pending') = 'active');
