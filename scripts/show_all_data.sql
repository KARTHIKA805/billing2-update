-- Make every signed-in staff member able to read the bakery tables.
-- Role checks for create, update, and delete stay in place.
-- Run this in the NEW Supabase project only.

insert into public.user_profiles (id, email, role, city_id, branch_id)
select u.id, u.email, 'super_admin', null, null
from auth.users u
where u.id = '46349fe4-f382-45c5-b058-6f5d8ec1d34b'
on conflict (id) do update
set
  role = 'super_admin',
  city_id = null,
  branch_id = null,
  email = excluded.email,
  updated_at = timezone('utc', now());

do $$
declare
  target text;
begin
  foreach target in array array[
    'categories', 'products', 'customers', 'sales', 'sale_items',
    'ingredients', 'product_ingredients', 'inventory_adjustments',
    'branch_inventory', 'cities', 'branches', 'user_profiles'
  ]
  loop
    if to_regclass('public.' || target) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'read_all_' || target, target);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      'read_all_' || target,
      target
    );
  end loop;
end $$;

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
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor public.user_profiles%rowtype;
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into actor from public.user_profiles where user_profiles.id = auth.uid();
  actor_role := public.normalize_app_role(coalesce(actor.role, ''));
  if actor.id is null and auth.uid() <> '46349fe4-f382-45c5-b058-6f5d8ec1d34b' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if actor.id is not null and actor_role = 'employee' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
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
end;
$$;

grant execute on function public.get_admin_users() to authenticated;

create or replace function public.can_bill_branch(target_branch uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.user_profiles%rowtype;
  actor_role text;
begin
  if target_branch is null or not public.can_read_branch(target_branch) then
    return false;
  end if;
  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null then
    return false;
  end if;
  actor_role := public.normalize_app_role(actor.role);
  return actor_role in ('super_admin', 'city_manager', 'branch_admin', 'employee');
end;
$$;

grant execute on function public.can_bill_branch(uuid) to authenticated;
