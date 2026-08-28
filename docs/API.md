# API Documentation

Base URL (development): `http://localhost:4000`

All responses use a consistent envelope:

```json
{ "success": true, "data": { ... } }
```
or, on error:
```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "...", "details": null } }
```

Paginated list endpoints wrap `items` like so:
```json
{ "success": true, "data": { "items": [...], "total": 42, "page": 1, "pageSize": 25, "totalPages": 2 } }
```

## Authentication

All endpoints except `/health`, `/api/auth/login`, and `/api/auth/refresh`
require a header:
```
Authorization: Bearer <accessToken>
```

Access tokens expire after 15 minutes (`ACCESS_TOKEN_TTL_SECONDS`). Use
`/api/auth/refresh` with the stored refresh token to obtain a new pair; the
refresh token itself rotates on every use.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password, tenantSlug? }` → `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` → new `{ accessToken, refreshToken, expiresIn }` |
| POST | `/api/auth/logout` | Revokes the current session |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` — revokes all other sessions |
| GET | `/api/auth/me` | Returns the current `AuthenticatedUserContext` (roles, permissions, branchIds) |

## Platform (Super Admin only) — `/api/platform/*`

Requires the `SUPER_ADMIN` role. These routes manage tenants, plans and
subscriptions — never tenant business data.

| Method | Path | Description |
|---|---|---|
| POST | `/api/platform/tenants` | Provision a new tenant + its Owner account |
| GET | `/api/platform/tenants` | List tenants (paginated, filter by `status`) |
| GET | `/api/platform/tenants/:tenantId` | Tenant details |
| PATCH | `/api/platform/tenants/:tenantId` | Update name/status |
| POST | `/api/platform/tenants/:tenantId/disable` | Disable a tenant (blocks all its users from logging in) |
| POST | `/api/platform/tenants/:tenantId/enable` | Re-enable a tenant |
| GET | `/api/platform/statistics` | Platform-wide counts |
| POST/GET | `/api/platform/plans` | Manage subscription plans |
| POST/GET | `/api/platform/subscriptions` | Manage tenant subscriptions |
| POST | `/api/platform/subscriptions/:id/suspend` | Suspend a subscription |

## Tenant-scoped endpoints

Every route below is scoped exclusively to `req.authContext.tenantId` —
**never** to a tenantId in the request body/query, which the client cannot
influence. All list/detail endpoints require the matching `*_VIEW`
permission; mutations require the corresponding `*_CREATE`/`*_UPDATE`/etc.
permission — see [ROLES_PERMISSIONS.md](ROLES_PERMISSIONS.md) for the full
matrix.

### Branches — `/api/branches`
`GET /`, `GET /:branchId`, `POST /`, `PATCH /:branchId`, `DELETE /:branchId`
(soft-deactivates if the branch has sales history instead of hard-deleting).

### Users — `/api/users`
`GET /`, `GET /:userId`, `POST /` (`{ fullName, email, password, roleCode, branchIds }`),
`PATCH /:userId`, `POST /:userId/deactivate`.

### Roles — `/api/roles`
`GET /` — lists this tenant's roles with their permission keys.
`GET /permissions` — the full permission catalogue (for building a custom
role UI).

### Products — `/api/products`
`GET /` (`?search=&brandId=&categoryId=&page=&pageSize=`), `GET /:productId`,
`GET /lookup/:code` (barcode or SKU exact match — used by the POS scanner),
`POST /`, `PATCH /:productId`, `POST /:productId/variants`.
Metadata sub-resources: `GET|POST /meta/brands`, `/meta/categories`,
`/meta/colors`, `/meta/sizes`.

### Inventory — `/api/inventory`
`GET /variant/:variantId` — stock across all branches for one variant.
`GET /branch/:branchId` — full stock list for one branch.
`GET /low-stock` (`?threshold=&branchId=`).
`POST /adjust` — `{ variantId, branchId, quantityDelta, reason }`.
`POST /transfer` — `{ variantId, fromBranchId, toBranchId, quantity, notes? }`
(requires branch access to **both** branches).

### Purchases — `/api/purchases`
`GET /` (`?branchId=&page=&pageSize=`).
`POST /` — `{ branchId, supplierId, items: [{variantId, quantity, unitCost}], notes? }`
— atomically creates the Purchase and increments stock via `PURCHASE_IN`
movements.

### Suppliers — `/api/suppliers`, Customers — `/api/customers`
Standard `GET /`, `GET /:id`, `POST /`, `PATCH /:id`.

### Sales / POS — `/api/sales`
`GET /` (`?branchId=&from=&to=&page=&pageSize=`), `GET /:saleId`.
`POST /` — the checkout endpoint:
```json
{
  "branchId": "...",
  "customerId": "optional",
  "items": [{ "variantId": "...", "quantity": 1, "unitPrice": 1200, "discountAmount": 0 }],
  "payments": [{ "method": "CASH", "amount": 1200 }],
  "discountAmount": 0,
  "clientRequestId": "a client-generated UUID — required for idempotency"
}
```
Re-submitting the same `clientRequestId` (e.g. after a timeout) returns the
original sale rather than creating a duplicate. A `SALE_DISCOUNT` permission
is required for any non-zero discount; without it the backend silently
zeroes out discounts regardless of what the client sent.
`POST /:saleId/cancel` — `{ reason }`, restocks all items.

### Returns — `/api/returns`
`GET /` (`?branchId=`).
`POST /` — `{ saleId, branchId, items: [{saleItemId, quantity}], reason }`.
Validates returned quantity never exceeds (quantity sold − already
returned) per line, and restocks via `RETURN_IN` movements.

### Expenses — `/api/expenses`
`GET /` (`?branchId=&page=&pageSize=`), `POST /`.

### Settings — `/api/settings`
`GET /`, `PATCH /` — currency, locale, invoice prefix, low-stock threshold.

### Reports — `/api/reports`
`GET /dashboard` — today/month/total sales, sales-by-branch, best-selling
variants, low-stock count, stock value, expenses, returns, estimated
profit. Automatically scoped to the caller's accessible branches (Owner
sees all; Manager/Cashier see only their assigned branches).
`GET /best-sizes-colors` — aggregate quantity sold per size/color.

### Subscription (tenant-facing) — `/api/subscription`
`GET /` — the CALLER'S OWN tenant's subscription history (read-only).

### Audit Logs — `/api/audit-logs`
`GET /` (`?page=&pageSize=`) — requires `AUDIT_VIEW`.

## Error codes

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed Zod validation |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired access token |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password on login |
| `FORBIDDEN` | 403 | Authenticated but lacking the required role/permission/branch access |
| `NOT_FOUND` | 404 | Resource doesn't exist **or belongs to another tenant** (see security note below) |
| `CONFLICT` | 409 | Unique constraint violation, insufficient stock, duplicate action |
| `TENANT_DISABLED` | 403 | The tenant has been disabled by a Super Admin |
| `SUBSCRIPTION_INACTIVE` | 402 | (reserved for subscription-gating logic) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Security note: why cross-tenant access returns 404, not 403

If tenant Mohamed's account requests a product ID that belongs to tenant
Hussein, the API returns exactly the same `404 NOT_FOUND` response it would
return for a completely nonexistent ID. This is intentional: returning
`403 FORBIDDEN` would let an attacker distinguish "this ID exists but isn't
yours" from "this ID doesn't exist at all," which is itself a data leak.
See `apps/server/src/lib/tenantGuard.ts` and
`apps/server/tests/unit/tenantGuard.test.ts`.
