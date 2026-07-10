-- Run after deploying the backend-only frontend/API changes.
-- This removes legacy public write policies because browser clients should no longer write directly to Supabase.

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
alter table public.admin_actions enable row level security;

-- Legacy open policies from the old frontend-direct architecture.
drop policy if exists "open users" on public.users;
drop policy if exists "users_all" on public.users;
drop policy if exists "open products" on public.products;
drop policy if exists "Allow Update Promotion" on public.products;
drop policy if exists "products_insert_all" on public.products;
drop policy if exists "products_update_all" on public.products;
drop policy if exists "products_delete_all" on public.products;
drop policy if exists "messages_all" on public.messages;
drop policy if exists "open messages" on public.messages;
drop policy if exists "Enable All Access" on public.payments;

-- Public read remains OK for marketplace browsing, but only active products are visible.
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active"
on public.products
for select
to anon, authenticated
using (coalesce(status, 'pending') = 'active');

-- Admins can inspect and moderate through authenticated Supabase Admin UI/API sessions.
drop policy if exists "users_admin_read" on public.users;
drop policy if exists "users_admin_update" on public.users;
create policy "users_admin_read"
on public.users
for select
to authenticated
using (exists (select 1 from public.admins a where a.auth_user_id = (select auth.uid()) or lower(a.email) = lower(auth.jwt() ->> 'email')));
create policy "users_admin_update"
on public.users
for update
to authenticated
using (exists (select 1 from public.admins a where a.auth_user_id = (select auth.uid()) or lower(a.email) = lower(auth.jwt() ->> 'email')))
with check (exists (select 1 from public.admins a where a.auth_user_id = (select auth.uid()) or lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Payment data is private. Server service role bypasses RLS for payment processing.
drop policy if exists "payments_owner_read" on public.payments;
create policy "payments_owner_read"
on public.payments
for select
to authenticated
using ((select auth.uid())::text = user_id);

-- Keep reports and ratings readable/writable only through existing constrained policies or server API.
-- The service role used by /api/app, /api/approve, /api/complete, and /api/send-telegram bypasses these RLS restrictions.
