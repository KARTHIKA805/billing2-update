-- City / branch locations and the full role ladder:
-- employee → branch_admin → city_manager → super_admin
-- Run this in the Supabase SQL editor on an existing Suvai database.

create extension if not exists "uuid-ossp";

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

alter table cities enable row level security;
alter table branches enable row level security;

drop policy if exists "Allow all access to cities" on cities;
drop policy if exists "Allow all access to branches" on branches;

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

alter table public.user_profiles add column if not exists city_id uuid;
alter table public.user_profiles add column if not exists branch_id uuid;
alter table public.sales add column if not exists branch_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_city_id_fkey'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_city_id_fkey
      foreign key (city_id) references public.cities(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_branch_id_fkey'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_branch_id_fkey
      foreign key (branch_id) references public.branches(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sales_branch_id_fkey'
  ) then
    alter table public.sales
      add constraint sales_branch_id_fkey
      foreign key (branch_id) references public.branches(id) on delete set null;
  end if;
end $$;

update user_profiles
set role = 'super_admin'
where lower(role) = 'admin';

alter table user_profiles drop constraint if exists user_profiles_role_check;
alter table user_profiles
  add constraint user_profiles_role_check
  check (role in ('employee', 'branch_admin', 'city_manager', 'super_admin', 'admin'));

insert into cities (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Chennai'),
  ('22222222-2222-2222-2222-222222222222', 'Coimbatore')
on conflict (name) do nothing;

insert into branches (id, city_id, name, address, phone)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'T. Nagar',
    'Usman Road, T. Nagar, Chennai, Tamil Nadu',
    '+91 98765 43210'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '11111111-1111-1111-1111-111111111111',
    'Anna Nagar',
    '2nd Avenue, Anna Nagar, Chennai, Tamil Nadu',
    '+91 98765 43211'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '22222222-2222-2222-2222-222222222222',
    'RS Puram',
    'DB Road, RS Puram, Coimbatore, Tamil Nadu',
    '+91 98765 43212'
  )
on conflict (city_id, name) do nothing;

-- Do not auto-tag historical sales as T. Nagar. Review untagged bills first:
-- select id, timestamp, total, created_by, branch_id
-- from public.sales
-- where branch_id is null
-- order by timestamp;

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
