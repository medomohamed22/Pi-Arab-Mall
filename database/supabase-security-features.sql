-- Deal Way security and feature schema
-- Run this in Supabase SQL Editor, then review policies for your exact auth model.
-- Important: strong RLS needs requests to carry a trusted pi_id claim, or writes should go through server APIs.

alter table if exists public.products add column if not exists price_usd numeric;
alter table if exists public.products add column if not exists price_pi_snapshot numeric;
alter table if exists public.products add column if not exists pi_usd_snapshot numeric;
alter table if exists public.products add column if not exists condition text default 'used';
alter table if exists public.products add column if not exists status text default 'pending';
alter table if exists public.products add column if not exists reviewed_by text;
alter table if exists public.products add column if not exists reviewed_at timestamptz;
alter table if exists public.products add column if not exists updated_at timestamptz default now();

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

create table if not exists public.admins (
  pi_id text primary key,
  username text,
  created_at timestamptz not null default now()
);

-- Add your admin Pi UID after creating the table:
-- insert into public.admins (pi_id, username) values ('YOUR_PI_UID', 'Admin') on conflict (pi_id) do nothing;

create table if not exists public.admin_actions (
  id bigserial primary key,
  admin_pi_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_seller on public.products(seller_pi_id);
create index if not exists idx_products_status_created on public.products(status, created_at desc);
create index if not exists idx_favorites_user on public.favorites(user_pi_id);
create index if not exists idx_ratings_seller on public.ratings(seller_pi_id);
create index if not exists idx_reports_status on public.reports(status, created_at desc);

alter table public.products enable row level security;
alter table public.messages enable row level security;
alter table public.users enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
alter table public.admin_actions enable row level security;

-- Helper for deployments where your backend mints Supabase JWTs with { "pi_id": "..." }.
create or replace function public.current_pi_id()
returns text
language sql
stable
as $$ select coalesce(auth.jwt() ->> 'pi_id', auth.jwt() -> 'user_metadata' ->> 'pi_id') $$;

-- Products: public can read active ads; owners can write their own ads.
drop policy if exists products_read_active on public.products;
create policy products_read_active on public.products for select using (coalesce(status,'pending') = 'active' or seller_pi_id = public.current_pi_id() or exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists products_owner_insert on public.products;
create policy products_owner_insert on public.products for insert with check (seller_pi_id = public.current_pi_id());

drop policy if exists products_owner_update on public.products;
create policy products_owner_update on public.products for update using (seller_pi_id = public.current_pi_id()) with check (seller_pi_id = public.current_pi_id());

drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products for delete using (seller_pi_id = public.current_pi_id());

-- Messages: only sender and receiver can read/write their conversations.
drop policy if exists messages_participants_read on public.messages;
create policy messages_participants_read on public.messages for select using (sender_pi_id = public.current_pi_id() or receiver_pi_id = public.current_pi_id());

drop policy if exists messages_sender_insert on public.messages;
create policy messages_sender_insert on public.messages for insert with check (sender_pi_id = public.current_pi_id());

drop policy if exists messages_receiver_update_read on public.messages;
create policy messages_receiver_update_read on public.messages for update using (receiver_pi_id = public.current_pi_id()) with check (receiver_pi_id = public.current_pi_id());

-- Favorites: users manage only their favorites.
drop policy if exists favorites_owner_all on public.favorites;
create policy favorites_owner_all on public.favorites for all using (user_pi_id = public.current_pi_id()) with check (user_pi_id = public.current_pi_id());

-- Ratings: public read, logged user writes their own rating.
drop policy if exists ratings_public_read on public.ratings;
create policy ratings_public_read on public.ratings for select using (true);

drop policy if exists ratings_owner_write on public.ratings;
create policy ratings_owner_write on public.ratings for insert with check (rater_pi_id = public.current_pi_id() and seller_pi_id <> public.current_pi_id());

drop policy if exists ratings_owner_update on public.ratings;
create policy ratings_owner_update on public.ratings for update using (rater_pi_id = public.current_pi_id()) with check (rater_pi_id = public.current_pi_id());

-- Reports: users create/read their reports. Admin review should use a server role API.
drop policy if exists reports_owner_insert on public.reports;
create policy reports_owner_insert on public.reports for insert with check (reporter_pi_id = public.current_pi_id());

drop policy if exists reports_owner_read on public.reports;
create policy reports_owner_read on public.reports for select using (reporter_pi_id = public.current_pi_id());

-- Storage hardening idea: create a private bucket or restrict uploads to user folders in Supabase Storage policies.

-- Admin policies: admins can review ads, read reports, and ban users.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select using (pi_id = public.current_pi_id());

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products for update using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id())) with check (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products for delete using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id())) with check (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists reports_admin_read on public.reports;
create policy reports_admin_read on public.reports for select using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports for update using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id())) with check (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));

drop policy if exists users_admin_read on public.users;
create policy users_admin_read on public.users for select using (exists (select 1 from public.admins a where a.pi_id = public.current_pi_id()));
