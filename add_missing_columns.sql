-- ============================================================
-- MIGRATION: Add missing columns to the sales table
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Add missing columns to sales table (safe: uses IF NOT EXISTS equivalent)
alter table sales add column if not exists subtotal numeric not null default 0;
alter table sales add column if not exists tax_amount numeric default 0;
alter table sales add column if not exists rounding_adjustment numeric default 0;
alter table sales add column if not exists paid_amount numeric not null default 0;
alter table sales add column if not exists payment_method text not null default 'CASH';
alter table sales add column if not exists points_earned numeric default 0;
alter table sales add column if not exists points_redeemed numeric default 0;
alter table sales add column if not exists discount_amount numeric default 0;
alter table sales add column if not exists created_by text not null default 'system';

-- Backfill subtotal and paid_amount from total for existing rows
update sales set subtotal = total where subtotal = 0;
update sales set paid_amount = total where paid_amount = 0;

-- Ensure RLS allows public inserts on sales and sale_items
drop policy if exists "Allow all access to sales" on sales;
create policy "Allow all access to sales"
  on sales for all to public using (true) with check (true);

drop policy if exists "Allow all access to sale_items" on sale_items;
create policy "Allow all access to sale_items"
  on sale_items for all to public using (true) with check (true);

-- Add image_url to categories table (safe: uses IF NOT EXISTS)
alter table categories add column if not exists image_url text;

-- Create Storage Bucket for Category Images
insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

-- Set up RLS Policies for category-images Storage Bucket
drop policy if exists "Allow public read access to category images" on storage.objects;
create policy "Allow public read access to category images"
  on storage.objects for select
  to public
  using (bucket_id = 'category-images');

drop policy if exists "Allow public insert access to category images" on storage.objects;
create policy "Allow public insert access to category images"
  on storage.objects for insert
  to public
  with check (bucket_id = 'category-images');

drop policy if exists "Allow public update access to category images" on storage.objects;
create policy "Allow public update access to category images"
  on storage.objects for update
  to public
  using (bucket_id = 'category-images')
  with check (bucket_id = 'category-images');

drop policy if exists "Allow public delete access to category images" on storage.objects;
create policy "Allow public delete access to category images"
  on storage.objects for delete
  to public
  using (bucket_id = 'category-images');

-- Done!
select 'Migration complete. Sales and categories tables and storage bucket now have all required columns/policies.' as status;

-- ============================================================
-- MIGRATION: Soft-delete support for products and ingredients
-- ============================================================
alter table products add column if not exists deleted_at timestamp with time zone;
alter table ingredients add column if not exists deleted_at timestamp with time zone;

-- ============================================================
-- MIGRATION: Fix delete failures from inventory_adjustments FK
-- ============================================================
alter table inventory_adjustments drop constraint if exists inventory_adjustments_product_id_fkey;
alter table inventory_adjustments
  add constraint inventory_adjustments_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;

alter table inventory_adjustments drop constraint if exists inventory_adjustments_ingredient_id_fkey;
alter table inventory_adjustments
  add constraint inventory_adjustments_ingredient_id_fkey
  foreign key (ingredient_id) references ingredients(id) on delete set null;

-- Split payment support on sales
alter table sales add column if not exists cash_paid numeric default 0;
alter table sales add column if not exists upi_paid numeric default 0;

-- Track last sign in on user profiles (also synced from auth.users via get_admin_users)
alter table user_profiles add column if not exists last_sign_in_at timestamp with time zone;
alter table user_profiles add column if not exists city_id uuid;
alter table user_profiles add column if not exists branch_id uuid;

drop function if exists public.get_admin_users();

create or replace function public.get_admin_users()
returns table (
  id uuid,
  email text,
  role text,
  city_id uuid,
  branch_id uuid,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.role,
    p.city_id,
    p.branch_id,
    p.created_at,
    coalesce(u.last_sign_in_at, p.last_sign_in_at) as last_sign_in_at
  from public.user_profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
$$;

grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.get_admin_users() to anon;
