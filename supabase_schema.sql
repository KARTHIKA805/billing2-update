-- Required for uuid_generate_v4()
create extension if not exists "uuid-ossp";

-- Create Categories Table
create table if not exists categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Cities and physical bakery branches
create table if not exists cities (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists branches (
  id uuid default uuid_generate_v4() primary key,
  city_id uuid not null references cities(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(city_id, name)
);

-- Create Employee/Admin User Profiles Table
-- Supabase Auth stores login credentials in auth.users.
-- This table stores app-level role/profile data for admin and employee users.
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'employee' check (role in ('employee', 'branch_admin', 'city_manager', 'super_admin', 'admin')),
  city_id uuid references cities(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_sign_in_at timestamp with time zone
);

-- Create Products Table
create table if not exists products (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  category text not null,
  price numeric not null,
  cost numeric not null,
  stock numeric not null,
  min_stock numeric default 0,
  unit text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- Create Customers Table
create table if not exists customers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  phone text,
  email text,
  notes text,
  loyalty_points numeric default 0,
  total_spent numeric default 0,
  join_date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create Sales Table
create table if not exists sales (
  id uuid default uuid_generate_v4() primary key,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  total numeric not null,
  subtotal numeric not null,
  tax_amount numeric default 0,
  rounding_adjustment numeric default 0,
  paid_amount numeric not null default 0,
  payment_method text not null default 'CASH',
  customer_id uuid references customers(id),
  points_earned numeric default 0,
  points_redeemed numeric default 0,
  discount_amount numeric default 0,
  cash_paid numeric default 0,
  upi_paid numeric default 0,
  created_by text not null default 'system',
  branch_id uuid references branches(id) on delete set null
);

-- Create Sale Items Table (Junction)
create table if not exists sale_items (
  id uuid default uuid_generate_v4() primary key,
  sale_id uuid references sales(id) on delete cascade not null,
  product_id uuid references products(id) not null,
  quantity numeric not null,
  price_at_sale numeric not null,
  product_name text -- Snapshot of name in case it changes
);

-- Create Ingredients Table
create table if not exists ingredients (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  unit text not null,
  current_stock numeric default 0,
  min_stock numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- Product ingredient requirements for bakery items
create table if not exists product_ingredients (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references products(id) on delete cascade not null,
  ingredient_id uuid references ingredients(id) on delete cascade not null,
  quantity_per_unit numeric not null,
  unique(product_id, ingredient_id)
);

-- Inventory stock adjustment history
create table if not exists inventory_adjustments (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references products(id) on delete set null,
  ingredient_id uuid references ingredients(id) on delete set null,
  branch_id uuid references branches(id) on delete set null,
  adjustment numeric not null,
  reason text not null,
  created_by text not null default 'system',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Per-branch product stock. products.stock stays as catalog fallback.
create table if not exists branch_inventory (
  branch_id uuid not null references branches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (branch_id, product_id)
);

-- RLS Policies (Optional but recommended - Basic Open Access for Admin App)
alter table categories enable row level security;
alter table cities enable row level security;
alter table branches enable row level security;
alter table user_profiles enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table ingredients enable row level security;
alter table product_ingredients enable row level security;
alter table inventory_adjustments enable row level security;
alter table branch_inventory enable row level security;

-- Seed the categories table from existing product rows, if any
insert into categories (name)
select distinct trim(category)
from products
where trim(category) <> ''
on conflict (name) do nothing;

insert into cities (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Chennai'),
  ('22222222-2222-2222-2222-222222222222', 'Coimbatore')
on conflict (name) do nothing;

insert into branches (id, city_id, name, address, phone)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'T. Nagar', 'Usman Road, T. Nagar, Chennai, Tamil Nadu', '+91 98765 43210'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'Anna Nagar', '2nd Avenue, Anna Nagar, Chennai, Tamil Nadu', '+91 98765 43211'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222', 'RS Puram', 'DB Road, RS Puram, Coimbatore, Tamil Nadu', '+91 98765 43212')
on conflict (city_id, name) do nothing;

insert into branch_inventory (branch_id, product_id, stock, min_stock)
select
  b.id,
  p.id,
  coalesce(p.stock, 0),
  coalesce(p.min_stock, 0)
from branches b
cross join products p
on conflict (branch_id, product_id) do nothing;

-- Policy to allow all access to public users for this single-user demo/admin app
-- Note: In a real multi-tenant app, restrict this access.
drop policy if exists "Allow all access to categories" on categories;
drop policy if exists "Allow all access to cities" on cities;
drop policy if exists "Allow all access to branches" on branches;
drop policy if exists "Allow all access to user_profiles" on user_profiles;
drop policy if exists "Allow all access to products" on products;
drop policy if exists "Allow all access to customers" on customers;
drop policy if exists "Allow all access to sales" on sales;
drop policy if exists "Allow all access to sale_items" on sale_items;
drop policy if exists "Allow all access to ingredients" on ingredients;
drop policy if exists "Allow all access to product_ingredients" on product_ingredients;
drop policy if exists "Allow all access to inventory_adjustments" on inventory_adjustments;
drop policy if exists "Allow all access to branch_inventory" on branch_inventory;

create policy "Allow all access to categories"
  on categories for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to cities"
  on cities for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to branches"
  on branches for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to user_profiles"
  on user_profiles for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to products"
  on products for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to customers"
  on customers for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to sales"
  on sales for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to sale_items"
  on sale_items for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to ingredients"
  on ingredients for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to product_ingredients"
  on product_ingredients for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to inventory_adjustments"
  on inventory_adjustments for all
  to public
  using (true)
  with check (true);
create policy "Allow all access to branch_inventory"
  on branch_inventory for all
  to public
  using (true)
  with check (true);

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
