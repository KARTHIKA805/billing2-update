# Suvai Bakery Database

Postgres database on the new Supabase project (`ikzycnnysyajibxgjvxc`). The browser uses the anon key. Passwords live only in `auth.users`. The app never stores them.

Run scripts in this order on a new database:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase_schema.sql` | Tables, seed cities and branches, open policies |
| 2 | `add_locations.sql` | City and branch columns and role check |
| 3 | `add_missing_columns.sql` | Sale payment columns, `last_sign_in_at`, storage policies |
| 4 | `add_branch_inventory.sql` | Per-outlet stock |
| 5 | `scripts/fix_user_management.sql` | Authorization, deletion, audit log, scoped policies |
| 6 | `scripts/show_all_data.sql` | Restore the Super Admin profile and widen reads |
| 7 | `scripts/confirm_sample_staff.sql` | Confirm sample staff and set their passwords |
| 8 | `scripts/create_cbe_city_manager.sql` | Coimbatore City Manager, password `Suvai` |

`fix_rls_policies.sql` is retired. Do not run it. It used to open every table to the public role.

Do not run these scripts against the old live bakery database.

## Roles

`user_profiles.role` allows `employee`, `branch_admin`, `city_manager`, `super_admin`, and the legacy value `admin`.

`public.normalize_app_role` maps `admin` and `superadmin` to `super_admin`.

| Role | `city_id` | `branch_id` |
|---|---|---|
| `super_admin` | null | null |
| `city_manager` | required | null |
| `branch_admin` | the branch's city | required |
| `employee` | the branch's city | required |

A branch must belong to the selected city. The app does not invent a city or branch when the value is missing.

## Tables

### `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Unique |
| `image_url` | text | Public storage URL |
| `created_at` | timestamptz | |

### `cities`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Unique |
| `created_at` | timestamptz | |

Seeded ids:

| City | Id |
|---|---|
| Chennai | `11111111-1111-1111-1111-111111111111` |
| Coimbatore | `22222222-2222-2222-2222-222222222222` |

Ramnad was added later in the live project and has a generated id.

### `branches`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `city_id` | uuid | References `cities(id)` on delete cascade |
| `name` | text | Unique per city |
| `address` | text | |
| `phone` | text | |
| `created_at` | timestamptz | |

Seeded outlets:

| Branch | Id | City |
|---|---|---|
| T. Nagar | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1` | Chennai |
| Anna Nagar | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2` | Chennai |
| RS Puram | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3` | Coimbatore |

Peelamedu and Ranipet exist in the live project with generated ids.

### `user_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, references `auth.users(id)` on delete cascade |
| `email` | text | Unique |
| `role` | text | See roles above |
| `city_id` | uuid | References `cities(id)` on delete set null |
| `branch_id` | uuid | References `branches(id)` on delete set null |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `last_sign_in_at` | timestamptz | |

Deleting `auth.users` removes the profile. Sales are not deleted with the user. `sales.created_by` is text, not a foreign key.

### `products`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | |
| `category` | text | Category name, not a foreign key |
| `price` | numeric | |
| `cost` | numeric | |
| `stock` | numeric | Catalog stock |
| `min_stock` | numeric | Default 0 |
| `unit` | text | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz | Null means active |

### `branch_inventory`

Primary key `(branch_id, product_id)`.

| Column | Type | Notes |
|---|---|---|
| `branch_id` | uuid | References `branches(id)` on delete cascade |
| `product_id` | uuid | References `products(id)` on delete cascade |
| `stock` | numeric | Outlet stock |
| `min_stock` | numeric | |
| `updated_at` | timestamptz | |

### `customers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | |
| `phone` | text | |
| `email` | text | |
| `notes` | text | |
| `loyalty_points` | numeric | Default 0 |
| `total_spent` | numeric | Default 0 |
| `join_date` | timestamptz | |
| `created_at` | timestamptz | |

### `sales`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `timestamp` | timestamptz | |
| `branch_id` | uuid | References `branches(id)` on delete set null |
| `total` | numeric | |
| `subtotal` | numeric | |
| `tax_amount` | numeric | CGST and SGST total stored here |
| `rounding_adjustment` | numeric | |
| `paid_amount` | numeric | |
| `payment_method` | text | `CASH`, `UPI`, `SPLIT`, `OTHER` |
| `cash_paid` | numeric | Split payments |
| `upi_paid` | numeric | Split payments |
| `customer_id` | uuid | References `customers(id)` |
| `points_earned` | numeric | |
| `points_redeemed` | numeric | |
| `discount_amount` | numeric | |
| `created_by` | text | Bill label, not a user id |

### `sale_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `sale_id` | uuid | References `sales(id)` on delete cascade |
| `product_id` | uuid | References `products(id)` |
| `quantity` | numeric | |
| `price_at_sale` | numeric | |
| `product_name` | text | Name at the time of sale |

### `ingredients`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Unique |
| `unit` | text | |
| `current_stock` | numeric | |
| `min_stock` | numeric | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz | |

### `product_ingredients`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `product_id` | uuid | On delete cascade |
| `ingredient_id` | uuid | On delete cascade |
| `quantity_per_unit` | numeric | |
| | | Unique `(product_id, ingredient_id)` |

### `inventory_adjustments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `product_id` | uuid | On delete set null |
| `ingredient_id` | uuid | On delete set null |
| `branch_id` | uuid | On delete set null |
| `adjustment` | numeric | |
| `reason` | text | |
| `created_by` | text | |
| `created_at` | timestamptz | |

### `user_audit_log`

Created by `scripts/fix_user_management.sql`. No passwords or tokens are written here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `action` | text | `create_user`, `update_user`, `update_location`, `delete_user` |
| `actor_id` | uuid | |
| `actor_email` | text | |
| `actor_role` | text | |
| `target_id` | uuid | |
| `target_email` | text | |
| `target_role` | text | |
| `target_city_id` | uuid | |
| `target_branch_id` | uuid | |
| `details` | jsonb | Previous role or location only |
| `created_at` | timestamptz | |

Select is limited to Super Admin.

## Row Level Security

`scripts/fix_user_management.sql` replaces the original public "allow all" policies.

| Area | Who can read | Who can write |
|---|---|---|
| Catalog (`products`, `categories`, `customers`, `ingredients`, `product_ingredients`, `inventory_adjustments`) | Active staff | Active staff |
| `cities`, `branches` | Super Admin: all. Others: assigned city or branch | Super Admin |
| `sales`, `sale_items` | Super Admin: all. City Manager: their city. Branch Admin and Employee: their branch | Insert: the caller can bill that branch. Update and delete: Super Admin, City Manager in the city, Branch Admin in the branch |
| `branch_inventory` | Same branch scope as sales | Stock updates follow branch read access. Delete follows edit access |
| `user_profiles` | Own row, plus users inside the caller's scope | Insert and update follow the role matrix. Direct delete is denied |
| `user_audit_log` | Super Admin | Written only by security-definer functions |

`scripts/show_all_data.sql` adds a `read_all_<table>` select policy of `using (true)` for authenticated users, so a signed-in staff member can read every bakery table. Create, update, and delete rules stay in place.

`public.can_bill_branch` allows `super_admin`, `city_manager`, `branch_admin`, and `employee` to insert a sale when `can_read_branch` is true for that outlet.

## Functions

| Function | Purpose |
|---|---|
| `normalize_app_role(text)` | Canonical role name |
| `current_staff_profile()` | Profile row for `auth.uid()` |
| `is_active_staff()` | True when that profile exists |
| `is_super_admin()` | True when the profile role is Super Admin |
| `staff_is_visible_to(...)` | Whether one profile may see another |
| `can_create_staff_user(...)` | Create permission |
| `can_delete_staff_user(...)` | Delete permission |
| `can_read_branch(uuid)` | Location read scope |
| `can_bill_branch(uuid)` | Checkout scope |
| `can_edit_branch_data(uuid)` | Bill edit and stock edit scope |
| `sale_branch_id(uuid)` | Branch of a sale, bypassing row security |
| `assert_can_create_staff(text, uuid, uuid)` | Raises when create is not allowed |
| `get_admin_users()` | Staff list for the signed-in manager |
| `update_staff_user_location(uuid, text, uuid, uuid)` | Super Admin location and role change |
| `delete_staff_user(uuid)` | Authorized delete, session revoke, auth user removal |
| `revoke_staff_auth_access(uuid)` | Deletes refresh tokens, sessions, identities, then `auth.users` |

Triggers on `user_profiles`:

| Trigger | Effect |
|---|---|
| `trg_enforce_user_profile_rules` | Validates role, city, and branch. Blocks self role changes and Super Admin edits |
| `trg_prevent_super_admin_delete` | Rejects delete of `super_admin` and `admin` |

## What a user delete does

1. Check the caller, target role, city, and branch.
2. Reject Super Admin targets and self-delete.
3. Insert `user_audit_log`.
4. Delete `auth.refresh_tokens`, `auth.sessions`, and `auth.identities` for that user.
5. Delete `auth.users`. The profile cascades away.
6. Leave `sales`, `sale_items`, `customers`, and catalog rows unchanged.

The function returns success only when the profile is gone and the auth user is deleted or disabled.
