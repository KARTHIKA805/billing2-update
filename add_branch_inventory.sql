-- Per-branch product stock. Does not change products.stock, so the current
-- live app keeps working until the new code is deployed.
-- Run this in the Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table if not exists public.branch_inventory (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (branch_id, product_id)
);

alter table public.inventory_adjustments
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.branch_inventory enable row level security;

drop policy if exists "Allow all access to branch_inventory" on public.branch_inventory;
create policy "Allow all access to branch_inventory"
  on public.branch_inventory for all
  to public
  using (true)
  with check (true);

-- Copy today's catalog stock to every existing outlet once.
insert into public.branch_inventory (branch_id, product_id, stock, min_stock)
select
  b.id,
  p.id,
  coalesce(p.stock, 0),
  coalesce(p.min_stock, 0)
from public.branches b
cross join public.products p
on conflict (branch_id, product_id) do nothing;
