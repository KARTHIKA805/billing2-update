# SQL used by Suvai Bakery Billing

The React app does not send raw SQL. Supabase PostgREST turns the client calls into the statements below. Table definitions, policies, and functions are the `.sql` files listed at the end.

Replace `$user`, `$id`, `$branch`, and the other `$` names with the uuid or text from the request.

## Auth profile

```sql
select id, email, role, city_id, branch_id
from public.user_profiles
where id = $user;

update public.user_profiles
set last_sign_in_at = $now, updated_at = $now
where id = $user;
```

## Cities and branches

```sql
select * from public.cities order by name;
select * from public.branches order by name;

insert into public.cities (name) values ($name) returning *;
update public.cities set name = $name where id = $id returning *;
delete from public.branches where city_id = $id;
delete from public.cities where id = $id;

insert into public.branches (city_id, name, address, phone)
values ($city, $name, $address, $phone) returning *;

update public.branches
set city_id = $city, name = $name, address = $address, phone = $phone
where id = $id
returning *;

delete from public.branches where id = $id;
```

## Products

```sql
select * from public.products where deleted_at is null;
select * from public.products where deleted_at is not null order by deleted_at desc;

insert into public.products (name, category, price, cost, stock, min_stock, unit)
values ($name, $category, $price, $cost, $stock, $min_stock, $unit)
returning *;

update public.products
set name = $name, category = $category, price = $price, cost = $cost,
    stock = $stock, min_stock = $min_stock, unit = $unit
where id = $id;

update public.products set deleted_at = $now where id = $id;
update public.products set deleted_at = null where id = $id;
update public.products set stock = $stock where id = $id;

select stock, min_stock from public.products where id = $id;
select id, stock, min_stock from public.products where id = any($ids);
select stock from public.products where id = $id;

delete from public.products where id = $id;
```

## Branch stock

```sql
select product_id, stock, min_stock
from public.branch_inventory
where branch_id = $branch;

select stock, min_stock
from public.branch_inventory
where branch_id = $branch and product_id = $product;

insert into public.branch_inventory (branch_id, product_id, stock, min_stock)
values ($branch, $product, $stock, $min_stock)
on conflict (branch_id, product_id) do update
set stock = excluded.stock, min_stock = excluded.min_stock;

select id from public.branches;
```

## Categories

```sql
select * from public.categories;

insert into public.categories (name, image_url)
values ($name, $image_url) returning *;

update public.categories
set name = $name, image_url = $image_url
where id = $id;

delete from public.categories where id = $id;
```

Storage object path: `category-images/<file name>`.

## Ingredients and links

```sql
select * from public.ingredients where deleted_at is null;
select * from public.ingredients where deleted_at is not null order by deleted_at desc;

insert into public.ingredients (name, unit, current_stock, min_stock)
values ($name, $unit, $stock, $min_stock) returning *;

update public.ingredients
set name = $name, unit = $unit, current_stock = $stock, min_stock = $min_stock
where id = $id;

update public.ingredients set deleted_at = $now where id = $id;
update public.ingredients set deleted_at = null where id = $id;
update public.ingredients set current_stock = $stock where id = $id;

select current_stock from public.ingredients where id = $id;
delete from public.ingredients where id = $id;

delete from public.product_ingredients where product_id = $id;
delete from public.product_ingredients where ingredient_id = $id;
```

## Inventory history

```sql
select *
from public.inventory_adjustments
order by created_at desc
limit 50;

insert into public.inventory_adjustments
  (product_id, ingredient_id, branch_id, adjustment, reason, created_by)
values ($product, $ingredient, $branch, $adjustment, $reason, $created_by);

delete from public.inventory_adjustments where product_id = $id;
delete from public.inventory_adjustments where ingredient_id = $id;
```

## Customers

```sql
select * from public.customers;

insert into public.customers (name, phone, email, notes, loyalty_points, total_spent)
values ($name, $phone, $email, $notes, 0, 0)
returning *;

select total_spent, loyalty_points from public.customers where id = $id;

update public.customers
set loyalty_points = $points, total_spent = $spent
where id = $id;

update public.sales set customer_id = null where customer_id = $id;
delete from public.customers where id = $id;
```

## Sales

```sql
select s.*, si.*
from public.sales s
left join public.sale_items si on si.sale_id = s.id
order by s.timestamp desc
limit 200;

select branch_id from public.sales where id = $id;

insert into public.sales (
  total, subtotal, tax_amount, rounding_adjustment, paid_amount,
  payment_method, customer_id, points_earned, points_redeemed,
  discount_amount, created_by, timestamp, branch_id, cash_paid, upi_paid
) values (
  $total, $subtotal, $tax, $rounding, $paid,
  $method, $customer, $earned, $redeemed,
  $discount, $label, $timestamp, $branch, $cash, $upi
) returning *;

insert into public.sale_items (sale_id, product_id, quantity, price_at_sale, product_name)
values ($sale, $product, $qty, $price, $name);

update public.sales
set total = $total, subtotal = $subtotal, tax_amount = $tax,
    rounding_adjustment = $rounding, paid_amount = $paid,
    payment_method = $method, customer_id = $customer,
    points_earned = $earned, points_redeemed = $redeemed,
    discount_amount = $discount, created_by = $label
where id = $id;

delete from public.sale_items where sale_id = $id;
delete from public.sales where id = $id;
```

## Staff RPC

```sql
select * from public.get_admin_users();

select public.assert_can_create_staff($role, $city, $branch);

select public.update_staff_user_location($target, $role, $city, $branch);

select public.delete_staff_user($target);
```

Profile upsert used after signup:

```sql
insert into public.user_profiles (id, email, role, city_id, branch_id, updated_at)
values ($id, $email, $role, $city, $branch, now())
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    city_id = excluded.city_id,
    branch_id = excluded.branch_id,
    updated_at = excluded.updated_at;
```

## Super Admin login

Run in the Supabase SQL editor. This creates or updates `ammukarthi8056@gmail.com` with password `demo2` and a `super_admin` profile with no city and no branch.

```sql
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  auth_id uuid;
  user_email text := 'ammukarthi8056@gmail.com';
  user_password text := 'demo2';
  user_role text := 'super_admin';
begin
  select id into auth_id
  from auth.users
  where lower(email) = lower(user_email)
  order by created_at
  limit 1;

  if auth_id is null then
    auth_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      auth_id, 'authenticated', 'authenticated', user_email,
      extensions.crypt(user_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', user_role),
      now(), now(), '', '', '', ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(user_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        banned_until = null,
        confirmation_token = '',
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('role', user_role),
        updated_at = now()
    where id = auth_id;
  end if;

  if not exists (
    select 1 from auth.identities where user_id = auth_id and provider = 'email'
  ) then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), auth_id,
      jsonb_build_object('sub', auth_id::text, 'email', user_email),
      'email', auth_id::text, now(), now(), now()
    );
  end if;

  insert into public.user_profiles (id, email, role, city_id, branch_id)
  values (auth_id, user_email, user_role, null, null)
  on conflict (id) do update
  set email = excluded.email, role = excluded.role,
      city_id = null, branch_id = null, updated_at = now();
end $$;
```

## Billing permission for every role

Run this so Super Admin and City Manager can save a bill, not only Branch Admin and Employee.

```sql
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
```

## SQL files in the project

| File | Contents |
|---|---|
| `supabase_schema.sql` | Full table DDL, seed cities and branches, original open policies |
| `add_locations.sql` | Cities, branches, profile location columns, `get_admin_users` |
| `add_missing_columns.sql` | Payment columns, last sign-in, category image storage policies |
| `add_branch_inventory.sql` | `branch_inventory` and stock copy |
| `scripts/fix_user_management.sql` | Audit log, role functions, triggers, delete and session revoke, scoped policies |
| `scripts/show_all_data.sql` | Super Admin profile restore, read policies, unscoped user list, billing function |
| `scripts/confirm_sample_staff.sql` | Sample staff passwords and locations |
| `scripts/create_cbe_city_manager.sql` | Coimbatore City Manager |
| `fix_rls_policies.sql` | Retired. Do not run |
