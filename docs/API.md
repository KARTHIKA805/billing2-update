# Suvai Bakery Billing API

This app has no custom HTTP server. Every call goes to the Supabase project configured in `.env`:

| Variable | Use |
|---|---|
| `VITE_SUPABASE_URL` | Project URL, for example `https://ikzycnnysyajibxgjvxc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. Sent as the `apikey` header. |
| `VITE_GEMINI_API_KEY` | Optional. Used only for the dashboard insight text. |

Authenticated requests also send `Authorization: Bearer <user access token>`.

There is no service-role key in the browser. `auth.admin.updateUserById` is present in code and fails with the anon key.

## Auth

Base path: `{VITE_SUPABASE_URL}/auth/v1`

| Action | Method and path | Body | Result |
|---|---|---|---|
| Sign in | `POST /token?grant_type=password` | `{ "email", "password" }` | Session with `access_token`, `refresh_token`, and `user` |
| Sign up a staff user | `POST /signup` | `{ "email", "password", "data": { "role", "city_id", "branch_id" } }` | New auth user. Uses an isolated client so the current admin stays signed in. |
| Sign out | `POST /logout` | none | Clears the session |
| Current user | `GET /user` | none | Auth user for the bearer token |
| Session | local `getSession` | none | Stored session |
| Refresh | `POST /token?grant_type=refresh_token` | `{ "refresh_token" }` | New access token |

After sign-in the app loads `user_profiles` for `id = auth.uid()`. If that row is missing, login stops. A missing Super Admin profile returns: "The Super Admin profile is missing, so Users cannot load."

Demo logins `admin`, `city`, `branch`, and `employee` with password `demo` never call Supabase.

## Roles

| Role | Value | Billing | User admin | Locations and categories |
|---|---|---|---|---|
| Employee | `employee` | Own branch | No | No |
| Branch Admin | `branch_admin` | Own branch | Employees in that branch | No |
| City Manager | `city_manager` | Branches in the assigned city | Employees and Branch Admins in that city | No |
| Super Admin | `super_admin` | Any branch after one is selected | All non–Super Admin users | Yes |

A bill always requires a real `branch_id`. Super Admin and City Manager are asked to pick an outlet before checkout.

## PostgREST

Base path: `{VITE_SUPABASE_URL}/rest/v1`

Headers:

```http
apikey: <anon key>
Authorization: Bearer <access token>
Content-Type: application/json
Prefer: return=representation
```

Row Level Security applies. A signed-out request sees no rows.

### Cities

| Action | Request |
|---|---|
| List | `GET /cities?select=*&order=name.asc` |
| Create | `POST /cities` body `{ "name" }` |
| Rename | `PATCH /cities?id=eq.{id}` body `{ "name" }` |
| Delete | `DELETE /branches?city_id=eq.{id}` then `DELETE /cities?id=eq.{id}` |

Create, rename, and delete are Super Admin operations.

### Branches

| Action | Request |
|---|---|
| List | `GET /branches?select=*&order=name.asc` |
| Create | `POST /branches` body `{ "city_id", "name", "address", "phone" }` |
| Update | `PATCH /branches?id=eq.{id}` body `{ "city_id", "name", "address", "phone" }` |
| Delete | `DELETE /branches?id=eq.{id}` |

### Products

| Action | Request |
|---|---|
| Active list | `GET /products?select=*&deleted_at=is.null` |
| Deleted list | `GET /products?select=*&deleted_at=not.is.null&order=deleted_at.desc` |
| Create | `POST /products` body `{ "name", "category", "price", "cost", "stock", "min_stock", "unit" }` |
| Update | `PATCH /products?id=eq.{id}` |
| Soft delete | `PATCH /products?id=eq.{id}` body `{ "deleted_at": "<iso timestamp>" }` |
| Restore | `PATCH /products?id=eq.{id}` body `{ "deleted_at": null }` |
| Hard delete | `DELETE /products?id=eq.{id}` after related rows are removed |
| Stock read | `GET /products?select=stock,min_stock&id=eq.{id}` |
| Stock write | `PATCH /products?id=eq.{id}` body `{ "stock" }` |

When a branch is selected, stock shown in the app comes from `branch_inventory` for that branch. `products.stock` remains the catalog fallback.

### Branch inventory

| Action | Request |
|---|---|
| One branch | `GET /branch_inventory?select=product_id,stock,min_stock&branch_id=eq.{branchId}` |
| One product | `GET /branch_inventory?select=stock,min_stock&branch_id=eq.{branchId}&product_id=eq.{productId}` |
| Upsert | `POST /branch_inventory?on_conflict=branch_id,product_id` body `{ "branch_id", "product_id", "stock", "min_stock" }` |

### Categories

| Action | Request |
|---|---|
| List | `GET /categories?select=*` |
| Create | `POST /categories` body `{ "name", "image_url" }` |
| Update | `PATCH /categories?id=eq.{id}` |
| Delete | `DELETE /categories?id=eq.{id}` |

Category images:

| Action | Request |
|---|---|
| Upload | `POST /storage/v1/object/category-images/{path}` |
| Public URL | `GET /storage/v1/object/public/category-images/{path}` |

### Ingredients

| Action | Request |
|---|---|
| Active list | `GET /ingredients?select=*&deleted_at=is.null` |
| Deleted list | `GET /ingredients?select=*&deleted_at=not.is.null&order=deleted_at.desc` |
| Create | `POST /ingredients` body `{ "name", "unit", "current_stock", "min_stock" }` |
| Update | `PATCH /ingredients?id=eq.{id}` |
| Soft delete | `PATCH /ingredients?id=eq.{id}` body `{ "deleted_at": "<iso timestamp>" }` |
| Restore | `PATCH /ingredients?id=eq.{id}` body `{ "deleted_at": null }` |
| Hard delete | `DELETE /ingredients?id=eq.{id}` |
| Stock | `GET /ingredients?select=current_stock&id=eq.{id}` then `PATCH` `{ "current_stock" }` |

### Product ingredients

| Action | Request |
|---|---|
| Remove links for a product | `DELETE /product_ingredients?product_id=eq.{id}` |
| Remove links for an ingredient | `DELETE /product_ingredients?ingredient_id=eq.{id}` |

### Inventory adjustments

| Action | Request |
|---|---|
| Recent | `GET /inventory_adjustments?select=*&order=created_at.desc&limit=50` |
| Insert | `POST /inventory_adjustments` body `{ "product_id", "ingredient_id", "branch_id", "adjustment", "reason", "created_by" }` |
| Delete by product | `DELETE /inventory_adjustments?product_id=eq.{id}` |
| Delete by ingredient | `DELETE /inventory_adjustments?ingredient_id=eq.{id}` |

If `branch_id` is rejected because the column is missing, the insert is retried without that field.

### Customers

| Action | Request |
|---|---|
| List | `GET /customers?select=*` |
| Create | `POST /customers` body `{ "name", "phone", "email", "notes", "loyalty_points", "total_spent" }` |
| Add loyalty after a sale | `PATCH /customers?id=eq.{id}` body `{ "loyalty_points", "total_spent" }` |
| Delete | `PATCH /sales?customer_id=eq.{id}` body `{ "customer_id": null }`, then `DELETE /customers?id=eq.{id}` |

### Sales and sale items

| Action | Request |
|---|---|
| History | `GET /sales?select=*,sale_items(*)&order=timestamp.desc&limit=200` |
| Create sale | `POST /sales` then `POST /sale_items` |
| Read branch of a sale | `GET /sales?select=branch_id&id=eq.{id}` |
| Update sale | `PATCH /sales?id=eq.{id}` |
| Replace items | `DELETE /sale_items?sale_id=eq.{id}` then `POST /sale_items` |
| Void | `DELETE /sale_items?sale_id=eq.{id}` then `DELETE /sales?id=eq.{id}` |

Create sale body:

```json
{
  "total": 120,
  "subtotal": 120,
  "tax_amount": 0,
  "rounding_adjustment": 0,
  "paid_amount": 120,
  "payment_method": "CASH",
  "customer_id": null,
  "points_earned": 120,
  "points_redeemed": 0,
  "discount_amount": 0,
  "created_by": "Counter",
  "timestamp": "2026-10-19T05:30:00.000Z",
  "branch_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  "cash_paid": 0,
  "upi_paid": 0
}
```

`cash_paid` and `upi_paid` are sent for `SPLIT` payments.

Sale item body:

```json
{
  "sale_id": "<sale uuid>",
  "product_id": "<product uuid>",
  "quantity": 2,
  "price_at_sale": 45,
  "product_name": "Achchu Murukku"
}
```

`payment_method` is `CASH`, `UPI`, `SPLIT`, or `OTHER`.

### User profiles

| Action | Request |
|---|---|
| Own profile | `GET /user_profiles?select=id,email,role,city_id,branch_id&id=eq.{userId}` |
| Touch last sign-in | `PATCH /user_profiles?id=eq.{userId}` body `{ "last_sign_in_at", "updated_at" }` |
| Create or update after signup | `POST /user_profiles?on_conflict=id` |
| Fallback list | `GET /user_profiles?select=*&order=created_at.desc` |
| Fallback location update | `PATCH /user_profiles?id=eq.{userId}` |

Profile write body:

```json
{
  "id": "<auth user uuid>",
  "email": "staff@example.com",
  "role": "employee",
  "city_id": "11111111-1111-1111-1111-111111111111",
  "branch_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  "updated_at": "2026-10-19T05:30:00.000Z"
}
```

Super Admin rows store `city_id` and `branch_id` as `null`. City Manager rows store `branch_id` as `null`.

## RPC

Base path: `POST {VITE_SUPABASE_URL}/rest/v1/rpc/{function}`

### `get_admin_users`

Body: `{}`

Returns rows:

```json
{
  "id": "uuid",
  "email": "text",
  "role": "text",
  "city_id": "uuid or null",
  "branch_id": "uuid or null",
  "created_at": "timestamptz",
  "last_sign_in_at": "timestamptz or null"
}
```

Employees receive `42501 Not authorized`. A call with no session receives `401 Not authenticated`.

### `assert_can_create_staff`

```json
{
  "p_role": "employee",
  "p_city_id": "11111111-1111-1111-1111-111111111111",
  "p_branch_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"
}
```

Returns `true` or raises `42501`.

### `update_staff_user_location`

Super Admin only. Cannot change a Super Admin account or promote someone to Super Admin.

```json
{
  "target_id": "uuid",
  "p_role": "branch_admin",
  "p_city_id": "uuid",
  "p_branch_id": "uuid"
}
```

Returns `{ "success": true, "id", "role", "city_id", "branch_id" }`.

### `delete_staff_user`

```json
{ "target_id": "uuid" }
```

Returns `{ "success": true, "id", "auth_deleted": true, "auth_disabled": true }` only after the profile is gone and the auth user is deleted or disabled. Super Admin targets are rejected. The caller cannot delete their own account.

If this function is not installed, the app does not delete the profile by itself. It asks for `scripts/fix_user_management.sql` to be applied.

## Optional Gemini call

`generateBakeryInsights` calls Google GenAI with `VITE_GEMINI_API_KEY`. It sends today's revenue, order count, and low-stock names, and expects a short Markdown summary. Billing, stock, and invoices do not depend on it.

## Errors the app surfaces

| Condition | Message |
|---|---|
| No session while loading users | Sign in with a staff email. Demo login has no database session. |
| `401` or JWT expired | Your sign-in expired. Sign in again, then open Users. |
| Not authorized to delete | Not authorized to delete this user. |
| Super Admin delete | Super Admin accounts cannot be deleted. |
| Missing branch on a bill | Select a branch before creating a bill. |
| Profile missing after login | Your account has been deactivated, or the Super Admin profile message above. |
