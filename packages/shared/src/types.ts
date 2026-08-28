export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';

export type TenantStatus = 'ACTIVE' | 'DISABLED';

export type StockMovementType =
  | 'PURCHASE_IN'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export type SaleStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export type PaymentMethod = 'CASH' | 'CARD' | 'MIXED';

export type PurchaseStatus = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface JwtAccessTokenPayload {
  sub: string; // userId
  tenantId: string | null; // null for SUPER_ADMIN
  sessionId: string;
  roles: string[];
  type: 'access';
}

export interface JwtRefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}

export interface AuthenticatedUserContext {
  userId: string;
  tenantId: string | null;
  sessionId: string;
  roleCodes: string[];
  permissions: string[];
  branchIds: string[]; // branches this user is explicitly assigned to (empty = all tenant branches, only meaningful for OWNER)
  isSuperAdmin: boolean;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
