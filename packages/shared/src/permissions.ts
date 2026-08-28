/**
 * Central permission catalogue.
 *
 * Every protected backend operation must be guarded by one (or more) of the
 * permission keys below. The frontend uses the same keys to decide what to
 * render, but the frontend check is a UX convenience only — the backend is
 * the actual enforcement point (see apps/server/src/middleware/authorize.ts).
 */
export const PERMISSIONS = {
  // Platform / Super Admin
  PLATFORM_MANAGE_TENANTS: 'platform.manage_tenants',
  PLATFORM_MANAGE_PLANS: 'platform.manage_plans',
  PLATFORM_MANAGE_SUBSCRIPTIONS: 'platform.manage_subscriptions',
  PLATFORM_VIEW_STATISTICS: 'platform.view_statistics',

  // Tenant / Branches
  BRANCH_CREATE: 'branch.create',
  BRANCH_UPDATE: 'branch.update',
  BRANCH_DELETE: 'branch.delete',
  BRANCH_VIEW: 'branch.view',

  // Users & Roles
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_VIEW: 'user.view',
  ROLE_MANAGE: 'role.manage',

  // Products / Catalogue
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',
  PRODUCT_VIEW: 'product.view',

  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_TRANSFER: 'inventory.transfer',

  // Purchases / Suppliers
  PURCHASE_CREATE: 'purchase.create',
  PURCHASE_VIEW: 'purchase.view',
  SUPPLIER_MANAGE: 'supplier.manage',
  SUPPLIER_VIEW: 'supplier.view',

  // Customers
  CUSTOMER_MANAGE: 'customer.manage',
  CUSTOMER_VIEW: 'customer.view',

  // POS / Sales
  POS_OPEN: 'pos.open',
  SALE_CREATE: 'sale.create',
  SALE_VIEW: 'sale.view',
  SALE_DISCOUNT: 'sale.apply_discount',
  SALE_CANCEL: 'sale.cancel',
  RETURN_CREATE: 'return.create',
  RETURN_VIEW: 'return.view',

  // Expenses
  EXPENSE_CREATE: 'expense.create',
  EXPENSE_VIEW: 'expense.view',

  // Reports
  REPORT_VIEW_BRANCH: 'report.view_branch',
  REPORT_VIEW_TENANT: 'report.view_tenant',

  // Settings
  SETTINGS_MANAGE: 'settings.manage',

  // Subscription (tenant-facing)
  SUBSCRIPTION_VIEW: 'subscription.view',

  // Audit
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/** System role codes. SUPER_ADMIN is platform-level and not scoped to any tenant. */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OWNER: 'OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  CASHIER: 'CASHIER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/**
 * Default permission sets granted to each system role when a tenant is
 * created. These are seeded into RolePermission rows so that permissions
 * remain data-driven (an Owner can later customize a custom role's
 * permissions) rather than hard-coded checks scattered in the codebase.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, PermissionKey[]> = {
  SUPER_ADMIN: [
    PERMISSIONS.PLATFORM_MANAGE_TENANTS,
    PERMISSIONS.PLATFORM_MANAGE_PLANS,
    PERMISSIONS.PLATFORM_MANAGE_SUBSCRIPTIONS,
    PERMISSIONS.PLATFORM_VIEW_STATISTICS,
  ],
  OWNER: [
    PERMISSIONS.BRANCH_CREATE,
    PERMISSIONS.BRANCH_UPDATE,
    PERMISSIONS.BRANCH_DELETE,
    PERMISSIONS.BRANCH_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DELETE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.ROLE_MANAGE,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.PRODUCT_DELETE,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.SUPPLIER_MANAGE,
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.POS_OPEN,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_DISCOUNT,
    PERMISSIONS.SALE_CANCEL,
    PERMISSIONS.RETURN_CREATE,
    PERMISSIONS.RETURN_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.REPORT_VIEW_BRANCH,
    PERMISSIONS.REPORT_VIEW_TENANT,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.SUBSCRIPTION_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  BRANCH_MANAGER: [
    PERMISSIONS.BRANCH_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.PURCHASE_CREATE,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.CUSTOMER_MANAGE,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.POS_OPEN,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_DISCOUNT,
    PERMISSIONS.RETURN_CREATE,
    PERMISSIONS.RETURN_VIEW,
    PERMISSIONS.EXPENSE_CREATE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.REPORT_VIEW_BRANCH,
  ],
  CASHIER: [
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.POS_OPEN,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.RETURN_CREATE,
  ],
};
