-- ============================================================
-- Suvai bakery: user management, deletion, and location security
-- Run in Supabase SQL Editor on the NEW project only.
-- Does not touch sales, invoices, customers, or catalog rows.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.user_audit_log (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  actor_id uuid,
  actor_email text,
  actor_role text,
  target_id uuid,
  target_email text,
  target_role text,
  target_city_id uuid,
  target_branch_id uuid,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_audit_log enable row level security;

create or replace function public.normalize_app_role(role text)
returns text
language sql
immutable
as $$
  select case replace(lower(coalesce(role, '')), '-', '_')
    when 'admin' then 'super_admin'
    when 'superadmin' then 'super_admin'
    when 'super_admin' then 'super_admin'
    when 'citymanager' then 'city_manager'
    when 'city_manager' then 'city_manager'
    when 'branchadmin' then 'branch_admin'
    when 'branch_admin' then 'branch_admin'
    else 'employee'
  end
$$;

create or replace function public.current_staff_profile()
returns public.user_profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.user_profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles where id = auth.uid()
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_app_role((public.current_staff_profile()).role) = 'super_admin'
$$;

create or replace function public.staff_is_visible_to(
  actor_role text,
  actor_city uuid,
  actor_branch uuid,
  actor_id uuid,
  target_id uuid,
  target_role text,
  target_city uuid,
  target_branch uuid
)
returns boolean
language sql
immutable
as $$
  select case public.normalize_app_role(actor_role)
    when 'super_admin' then true
    when 'city_manager' then
      target_id = actor_id
      or (
        public.normalize_app_role(target_role) not in ('super_admin', 'admin')
        and actor_city is not null
        and target_city = actor_city
      )
    when 'branch_admin' then
      target_id = actor_id
      or (
        public.normalize_app_role(target_role) = 'employee'
        and actor_branch is not null
        and target_branch = actor_branch
      )
    else target_id = actor_id
  end
$$;

create or replace function public.can_delete_staff_user(
  actor_role text,
  actor_city uuid,
  actor_branch uuid,
  target_role text,
  target_city uuid,
  target_branch uuid
)
returns boolean
language sql
immutable
as $$
  select case
    when public.normalize_app_role(target_role) in ('super_admin', 'admin') then false
    when public.normalize_app_role(actor_role) = 'super_admin' then true
    when public.normalize_app_role(actor_role) = 'city_manager' then
      actor_city is not null
      and target_city = actor_city
      and public.normalize_app_role(target_role) in ('employee', 'branch_admin')
    when public.normalize_app_role(actor_role) = 'branch_admin' then
      actor_branch is not null
      and target_branch = actor_branch
      and public.normalize_app_role(target_role) = 'employee'
    else false
  end
$$;

create or replace function public.can_create_staff_user(
  actor_role text,
  actor_city uuid,
  actor_branch uuid,
  target_role text,
  target_city uuid,
  target_branch uuid
)
returns boolean
language sql
immutable
as $$
  select case public.normalize_app_role(actor_role)
    when 'super_admin' then true
    when 'city_manager' then
      public.normalize_app_role(target_role) in ('employee', 'branch_admin')
      and actor_city is not null
      and target_city = actor_city
    when 'branch_admin' then
      public.normalize_app_role(target_role) = 'employee'
      and actor_branch is not null
      and target_branch = actor_branch
    else false
  end
$$;

create or replace function public.assert_can_create_staff(
  p_role text,
  p_city_id uuid default null,
  p_branch_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.user_profiles%rowtype;
  location_city uuid := p_city_id;
  location_branch uuid := p_branch_id;
  branch_city uuid;
  target_role text := public.normalize_app_role(p_role);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if target_role = 'super_admin' then
    location_city := null;
    location_branch := null;
  elsif target_role = 'city_manager' then
    location_branch := null;
    if location_city is null then
      raise exception 'City Manager must be assigned to a city';
    end if;
  else
    if location_branch is null or location_city is null then
      raise exception 'This role requires a city and branch';
    end if;
    select city_id into branch_city from public.branches where id = location_branch;
    if branch_city is null then
      raise exception 'Select a valid branch';
    end if;
    if branch_city is distinct from location_city then
      raise exception 'Branch does not belong to the selected city';
    end if;
    location_city := branch_city;
  end if;

  if not public.can_create_staff_user(
    actor.role, actor.city_id, actor.branch_id,
    target_role, location_city, location_branch
  ) then
    raise exception 'Not authorized to create this user' using errcode = '42501';
  end if;

  return true;
end;
$$;

create or replace function public.enforce_user_profile_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.user_profiles%rowtype;
  actor_role text;
  branch_city uuid;
  target_role text;
begin
  target_role := public.normalize_app_role(new.role);
  new.role := target_role;
  new.updated_at := timezone('utc'::text, now());

  if target_role = 'super_admin' then
    new.city_id := null;
    new.branch_id := null;
  elsif target_role = 'city_manager' then
    new.branch_id := null;
    if new.city_id is null then
      raise exception 'City Manager must be assigned to a city';
    end if;
    if not exists (select 1 from public.cities where id = new.city_id) then
      raise exception 'Select a valid city';
    end if;
  else
    if new.branch_id is not null then
      select city_id into branch_city from public.branches where id = new.branch_id;
      if branch_city is null then
        raise exception 'Select a valid branch';
      end if;
      new.city_id := branch_city;
    end if;
    if new.city_id is null or new.branch_id is null then
      raise exception 'This role requires a city and branch';
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  actor_role := public.normalize_app_role(actor.role);

  if tg_op = 'INSERT' then
    if not public.can_create_staff_user(
      actor.role, actor.city_id, actor.branch_id,
      new.role, new.city_id, new.branch_id
    ) then
      raise exception 'Not authorized to create this user' using errcode = '42501';
    end if;
    insert into public.user_audit_log (
      action, actor_id, actor_email, actor_role,
      target_id, target_email, target_role, target_city_id, target_branch_id, details
    ) values (
      'create_user',
      actor.id, actor.email, actor_role,
      new.id, new.email, target_role, new.city_id, new.branch_id,
      jsonb_build_object('source', 'user_profiles')
    );
    return new;
  end if;

  if old.id = auth.uid() then
    if public.normalize_app_role(new.role) is distinct from public.normalize_app_role(old.role)
      or new.city_id is distinct from old.city_id
      or new.branch_id is distinct from old.branch_id
      or new.email is distinct from old.email then
      raise exception 'You cannot change your own role or location' using errcode = '42501';
    end if;
    return new;
  end if;

  if public.normalize_app_role(old.role) in ('super_admin', 'admin') then
    raise exception 'Super Admin accounts cannot be modified' using errcode = '42501';
  end if;

  if target_role = 'super_admin' then
    raise exception 'Cannot promote a user to Super Admin' using errcode = '42501';
  end if;

  if actor_role = 'super_admin' then
    if public.normalize_app_role(new.role) is distinct from public.normalize_app_role(old.role)
      or new.city_id is distinct from old.city_id
      or new.branch_id is distinct from old.branch_id then
      insert into public.user_audit_log (
        action, actor_id, actor_email, actor_role,
        target_id, target_email, target_role, target_city_id, target_branch_id, details
      ) values (
        'update_user',
        actor.id, actor.email, actor_role,
        new.id, new.email, target_role, new.city_id, new.branch_id,
        jsonb_build_object(
          'previous_role', public.normalize_app_role(old.role),
          'previous_city_id', old.city_id,
          'previous_branch_id', old.branch_id
        )
      );
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Not authorized to change this role' using errcode = '42501';
  end if;

  if not public.can_create_staff_user(
    actor.role, actor.city_id, actor.branch_id,
    new.role, new.city_id, new.branch_id
  ) then
    raise exception 'Not authorized to update this user' using errcode = '42501';
  end if;

  if public.normalize_app_role(new.role) is distinct from public.normalize_app_role(old.role)
    or new.city_id is distinct from old.city_id
    or new.branch_id is distinct from old.branch_id then
    insert into public.user_audit_log (
      action, actor_id, actor_email, actor_role,
      target_id, target_email, target_role, target_city_id, target_branch_id, details
    ) values (
      'update_user',
      actor.id, actor.email, actor_role,
      new.id, new.email, target_role, new.city_id, new.branch_id,
      jsonb_build_object(
        'previous_role', public.normalize_app_role(old.role),
        'previous_city_id', old.city_id,
        'previous_branch_id', old.branch_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_profile_rules on public.user_profiles;
create trigger trg_enforce_user_profile_rules
before insert or update on public.user_profiles
for each row execute procedure public.enforce_user_profile_rules();

create or replace function public.prevent_super_admin_delete()
returns trigger
language plpgsql
as $$
begin
  if public.normalize_app_role(old.role) in ('super_admin', 'admin') then
    raise exception 'Super Admin accounts cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_super_admin_delete on public.user_profiles;
create trigger trg_prevent_super_admin_delete
before delete on public.user_profiles
for each row execute procedure public.prevent_super_admin_delete();

create or replace function public.revoke_staff_auth_access(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_remaining boolean := true;
begin
  if target_id is null then
    return false;
  end if;

  begin
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using target_id::text;
  exception when undefined_table then
    null;
  end;

  begin
    execute 'delete from auth.sessions where user_id::text = $1' using target_id::text;
  exception when undefined_table then
    null;
  end;

  begin
    execute 'delete from auth.mfa_factors where user_id::text = $1' using target_id::text;
  exception when undefined_table then
    null;
  end;

  begin
    execute 'delete from auth.one_time_tokens where user_id::text = $1' using target_id::text;
  exception when undefined_table then
    null;
  end;

  begin
    execute 'delete from auth.identities where user_id::text = $1' using target_id::text;
  exception when undefined_table then
    null;
  end;

  update auth.users
  set banned_until = 'infinity'::timestamptz
  where id = target_id;

  delete from auth.users where id = target_id;

  select exists(select 1 from auth.users where id = target_id) into auth_remaining;
  return not auth_remaining;
end;
$$;

create or replace function public.delete_staff_user(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor public.user_profiles%rowtype;
  target public.user_profiles%rowtype;
  auth_removed boolean := false;
  profile_remaining boolean := false;
  auth_remaining boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if target_id is null or target_id = auth.uid() then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;

  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into target from public.user_profiles where id = target_id;
  if target.id is null then
    raise exception 'User not found';
  end if;

  if not public.can_delete_staff_user(
    actor.role, actor.city_id, actor.branch_id,
    target.role, target.city_id, target.branch_id
  ) then
    raise exception 'Not authorized to delete this user' using errcode = '42501';
  end if;

  insert into public.user_audit_log (
    action, actor_id, actor_email, actor_role,
    target_id, target_email, target_role, target_city_id, target_branch_id, details
  ) values (
    'delete_user',
    actor.id,
    actor.email,
    public.normalize_app_role(actor.role),
    target.id,
    target.email,
    public.normalize_app_role(target.role),
    target.city_id,
    target.branch_id,
    jsonb_build_object('source', 'delete_staff_user')
  );

  auth_removed := public.revoke_staff_auth_access(target_id);

  delete from public.user_profiles
  where id = target_id
    and public.normalize_app_role(role) not in ('super_admin', 'admin');

  select exists(select 1 from public.user_profiles where id = target_id) into profile_remaining;
  select exists(select 1 from auth.users where id = target_id) into auth_remaining;

  if profile_remaining then
    raise exception 'User profile could not be removed';
  end if;

  if auth_remaining and not auth_removed then
    raise exception 'Authentication account could not be revoked';
  end if;

  if auth_remaining then
    return jsonb_build_object(
      'success', true,
      'id', target_id,
      'auth_deleted', false,
      'auth_disabled', true
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'id', target_id,
    'auth_deleted', true,
    'auth_disabled', true
  );
end;
$$;

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
  if actor.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  actor_role := public.normalize_app_role(actor.role);
  if actor_role = 'employee' then
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
  where public.staff_is_visible_to(
    actor_role, actor.city_id, actor.branch_id, actor.id,
    p.id, p.role, p.city_id, p.branch_id
  )
  order by p.created_at desc;
end;
$$;

create or replace function public.update_staff_user_location(
  target_id uuid,
  p_role text default null,
  p_city_id uuid default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.user_profiles%rowtype;
  target public.user_profiles%rowtype;
  next_role text;
  next_city uuid;
  next_branch uuid;
  branch_city uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null or public.normalize_app_role(actor.role) <> 'super_admin' then
    raise exception 'Not authorized to update user location' using errcode = '42501';
  end if;

  select * into target from public.user_profiles where id = target_id;
  if target.id is null then
    raise exception 'User not found';
  end if;

  if public.normalize_app_role(target.role) in ('super_admin', 'admin') then
    raise exception 'Super Admin accounts cannot be modified';
  end if;

  next_role := public.normalize_app_role(coalesce(p_role, target.role));
  if next_role = 'super_admin' then
    raise exception 'Use user creation to add a Super Admin';
  end if;

  next_city := p_city_id;
  next_branch := p_branch_id;
  if next_role = 'city_manager' then
    next_branch := null;
  elsif next_branch is not null then
    select city_id into branch_city from public.branches where id = next_branch;
    if branch_city is null then
      raise exception 'Select a valid branch';
    end if;
    next_city := branch_city;
  end if;

  update public.user_profiles
  set
    role = next_role,
    city_id = next_city,
    branch_id = next_branch,
    updated_at = timezone('utc'::text, now())
  where id = target_id;

  insert into public.user_audit_log (
    action, actor_id, actor_email, actor_role,
    target_id, target_email, target_role, target_city_id, target_branch_id, details
  ) values (
    'update_location',
    actor.id,
    actor.email,
    'super_admin',
    target.id,
    target.email,
    next_role,
    next_city,
    next_branch,
    jsonb_build_object('previous_city_id', target.city_id, 'previous_branch_id', target.branch_id)
  );

  return jsonb_build_object('success', true, 'id', target_id, 'role', next_role, 'city_id', next_city, 'branch_id', next_branch);
end;
$$;

-- Repair mismatched location rows without deleting users or billing data.
update public.user_profiles
set city_id = null, branch_id = null
where public.normalize_app_role(role) = 'super_admin'
  and (city_id is not null or branch_id is not null);

update public.user_profiles
set branch_id = null
where public.normalize_app_role(role) = 'city_manager'
  and branch_id is not null;

update public.user_profiles p
set city_id = b.city_id
from public.branches b
where p.branch_id = b.id
  and public.normalize_app_role(p.role) in ('employee', 'branch_admin')
  and p.city_id is distinct from b.city_id;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'user_audit_log'
  loop
    execute format('drop policy if exists %I on public.user_audit_log', pol.policyname);
  end loop;
end $$;

drop policy if exists "Allow all access to user_profiles" on public.user_profiles;
drop policy if exists "user_profiles_select" on public.user_profiles;
drop policy if exists "user_profiles_insert" on public.user_profiles;
drop policy if exists "user_profiles_update" on public.user_profiles;
drop policy if exists "user_profiles_delete" on public.user_profiles;

create policy "user_profiles_select"
  on public.user_profiles for select to authenticated
  using (
    public.staff_is_visible_to(
      (public.current_staff_profile()).role,
      (public.current_staff_profile()).city_id,
      (public.current_staff_profile()).branch_id,
      (public.current_staff_profile()).id,
      id, role, city_id, branch_id
    )
  );

create policy "user_profiles_insert"
  on public.user_profiles for insert to authenticated
  with check (
    public.can_create_staff_user(
      (public.current_staff_profile()).role,
      (public.current_staff_profile()).city_id,
      (public.current_staff_profile()).branch_id,
      role, city_id, branch_id
    )
  );

create policy "user_profiles_update"
  on public.user_profiles for update to authenticated
  using (
    id = auth.uid()
    or public.normalize_app_role((public.current_staff_profile()).role) = 'super_admin'
    or public.can_create_staff_user(
      (public.current_staff_profile()).role,
      (public.current_staff_profile()).city_id,
      (public.current_staff_profile()).branch_id,
      role, city_id, branch_id
    )
  )
  with check (
    id = auth.uid()
    or public.normalize_app_role((public.current_staff_profile()).role) = 'super_admin'
    or public.can_create_staff_user(
      (public.current_staff_profile()).role,
      (public.current_staff_profile()).city_id,
      (public.current_staff_profile()).branch_id,
      role, city_id, branch_id
    )
  );

create policy "user_profiles_delete"
  on public.user_profiles for delete to authenticated
  using (false);

create policy "user_audit_log_select"
  on public.user_audit_log for select to authenticated
  using (public.is_super_admin());

-- Shared catalog stays available to signed-in staff. Anonymous clients and
-- deleted accounts cannot read it. Sales rows are never deleted by this script.
create or replace function public.replace_open_policy(target_table text)
returns void
language plpgsql
as $$
declare
  pol record;
begin
  if to_regclass('public.' || target_table) is null then
    return;
  end if;
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = target_table
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, target_table);
  end loop;
  execute format('drop policy if exists %I on public.%I', 'Allow all access to ' || target_table, target_table);
  execute format('drop policy if exists %I on public.%I', 'active_staff_all_' || target_table, target_table);
  execute format('alter table public.%I enable row level security', target_table);
  execute format(
    'create policy %I on public.%I for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff())',
    'active_staff_all_' || target_table,
    target_table
  );
end;
$$;

select public.replace_open_policy('categories');
select public.replace_open_policy('products');
select public.replace_open_policy('customers');
select public.replace_open_policy('ingredients');
select public.replace_open_policy('product_ingredients');
select public.replace_open_policy('inventory_adjustments');

drop function if exists public.replace_open_policy(text);

create or replace function public.can_read_branch(target_branch uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.user_profiles%rowtype;
  actor_role text;
  branch_city uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  select * into actor from public.user_profiles where id = auth.uid();
  if actor.id is null then
    return false;
  end if;
  actor_role := public.normalize_app_role(actor.role);
  if target_branch is null then
    return actor_role = 'super_admin';
  end if;
  if actor_role = 'super_admin' then
    return true;
  end if;
  select city_id into branch_city from public.branches where id = target_branch;
  if branch_city is null then
    return false;
  end if;
  if actor_role = 'city_manager' then
    return actor.city_id is not null and branch_city = actor.city_id;
  end if;
  return actor.branch_id is not null and target_branch = actor.branch_id;
end;
$$;

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
  if not public.can_read_branch(target_branch) then
    return false;
  end if;
  select * into actor from public.user_profiles where id = auth.uid();
  actor_role := public.normalize_app_role(actor.role);
  return actor_role in ('employee', 'branch_admin') and actor.branch_id = target_branch;
end;
$$;

create or replace function public.can_edit_branch_data(target_branch uuid)
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
  if not public.can_read_branch(target_branch) then
    return false;
  end if;
  select * into actor from public.user_profiles where id = auth.uid();
  actor_role := public.normalize_app_role(actor.role);
  return actor_role in ('super_admin', 'city_manager', 'branch_admin');
end;
$$;

create or replace function public.sale_branch_id(target_sale uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.sales where id = target_sale
$$;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.branch_inventory enable row level security;

do $$
declare
  pol record;
  target_table text;
begin
  foreach target_table in array array['sales', 'sale_items', 'branch_inventory', 'cities', 'branches']
  loop
    if to_regclass('public.' || target_table) is null then
      continue;
    end if;
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, target_table);
    end loop;
  end loop;
end $$;

drop policy if exists "Allow all access to sales" on public.sales;
drop policy if exists "active_staff_all_sales" on public.sales;
drop policy if exists "sales_select" on public.sales;
drop policy if exists "sales_insert" on public.sales;
drop policy if exists "sales_update" on public.sales;
drop policy if exists "sales_delete" on public.sales;

create policy "sales_select"
  on public.sales for select to authenticated
  using (public.can_read_branch(branch_id));
create policy "sales_insert"
  on public.sales for insert to authenticated
  with check (public.can_bill_branch(branch_id));
create policy "sales_update"
  on public.sales for update to authenticated
  using (public.can_edit_branch_data(branch_id))
  with check (public.can_edit_branch_data(branch_id));
create policy "sales_delete"
  on public.sales for delete to authenticated
  using (public.can_edit_branch_data(branch_id));

drop policy if exists "Allow all access to sale_items" on public.sale_items;
drop policy if exists "active_staff_all_sale_items" on public.sale_items;
drop policy if exists "sale_items_select" on public.sale_items;
drop policy if exists "sale_items_insert" on public.sale_items;
drop policy if exists "sale_items_update" on public.sale_items;
drop policy if exists "sale_items_delete" on public.sale_items;

create policy "sale_items_select"
  on public.sale_items for select to authenticated
  using (public.can_read_branch(public.sale_branch_id(sale_id)));
create policy "sale_items_insert"
  on public.sale_items for insert to authenticated
  with check (public.can_bill_branch(public.sale_branch_id(sale_id)) or public.can_edit_branch_data(public.sale_branch_id(sale_id)));
create policy "sale_items_update"
  on public.sale_items for update to authenticated
  using (public.can_edit_branch_data(public.sale_branch_id(sale_id)))
  with check (public.can_edit_branch_data(public.sale_branch_id(sale_id)));
create policy "sale_items_delete"
  on public.sale_items for delete to authenticated
  using (public.can_edit_branch_data(public.sale_branch_id(sale_id)));

drop policy if exists "Allow all access to branch_inventory" on public.branch_inventory;
drop policy if exists "active_staff_all_branch_inventory" on public.branch_inventory;
drop policy if exists "branch_inventory_select" on public.branch_inventory;
drop policy if exists "branch_inventory_insert" on public.branch_inventory;
drop policy if exists "branch_inventory_update" on public.branch_inventory;
drop policy if exists "branch_inventory_delete" on public.branch_inventory;

create policy "branch_inventory_select"
  on public.branch_inventory for select to authenticated
  using (public.can_read_branch(branch_id));
create policy "branch_inventory_insert"
  on public.branch_inventory for insert to authenticated
  with check (public.can_read_branch(branch_id));
create policy "branch_inventory_update"
  on public.branch_inventory for update to authenticated
  using (public.can_read_branch(branch_id))
  with check (public.can_read_branch(branch_id));
create policy "branch_inventory_delete"
  on public.branch_inventory for delete to authenticated
  using (public.can_edit_branch_data(branch_id));

drop policy if exists "Allow all access to cities" on public.cities;
drop policy if exists "Allow all access to branches" on public.branches;
drop policy if exists "cities_select" on public.cities;
drop policy if exists "cities_write" on public.cities;
drop policy if exists "cities_update" on public.cities;
drop policy if exists "cities_delete" on public.cities;
drop policy if exists "branches_select" on public.branches;
drop policy if exists "branches_write" on public.branches;
drop policy if exists "branches_update" on public.branches;
drop policy if exists "branches_delete" on public.branches;

create policy "cities_select"
  on public.cities for select to authenticated
  using (
    public.is_super_admin()
    or id = (public.current_staff_profile()).city_id
  );
create policy "cities_write"
  on public.cities for insert to authenticated
  with check (public.is_super_admin());
create policy "cities_update"
  on public.cities for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "cities_delete"
  on public.cities for delete to authenticated
  using (public.is_super_admin());

create policy "branches_select"
  on public.branches for select to authenticated
  using (public.can_read_branch(id));
create policy "branches_write"
  on public.branches for insert to authenticated
  with check (public.is_super_admin());
create policy "branches_update"
  on public.branches for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy "branches_delete"
  on public.branches for delete to authenticated
  using (public.is_super_admin());

revoke all on function public.delete_staff_user(uuid) from public;
revoke all on function public.get_admin_users() from public;
revoke all on function public.assert_can_create_staff(text, uuid, uuid) from public;
revoke all on function public.update_staff_user_location(uuid, text, uuid, uuid) from public;
revoke all on function public.revoke_staff_auth_access(uuid) from public;
revoke all on function public.current_staff_profile() from public;

grant execute on function public.delete_staff_user(uuid) to authenticated;
grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.assert_can_create_staff(text, uuid, uuid) to authenticated;
grant execute on function public.update_staff_user_location(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.current_staff_profile() to authenticated;
grant execute on function public.is_active_staff() to public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.normalize_app_role(text) to authenticated;
grant execute on function public.staff_is_visible_to(text, uuid, uuid, uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.can_delete_staff_user(text, uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.can_create_staff_user(text, uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.can_read_branch(uuid) to authenticated;
grant execute on function public.can_bill_branch(uuid) to authenticated;
grant execute on function public.can_edit_branch_data(uuid) to authenticated;
grant execute on function public.sale_branch_id(uuid) to authenticated;

revoke all on function public.can_read_branch(uuid) from public;
revoke all on function public.can_bill_branch(uuid) from public;
revoke all on function public.can_edit_branch_data(uuid) from public;
revoke all on function public.sale_branch_id(uuid) from public;
grant execute on function public.can_read_branch(uuid) to authenticated;
grant execute on function public.can_bill_branch(uuid) to authenticated;
grant execute on function public.can_edit_branch_data(uuid) to authenticated;
grant execute on function public.sale_branch_id(uuid) to authenticated;

-- Restore a Super Admin profile if the Auth account remains and the profile row was removed.
insert into public.user_profiles (id, email, role, city_id, branch_id)
select u.id, u.email, 'super_admin', null, null
from auth.users u
where u.id = '46349fe4-f382-45c5-b058-6f5d8ec1d34b'
  and not exists (
    select 1 from public.user_profiles p where p.id = u.id
  );

select 'User management security migration complete.' as status;
