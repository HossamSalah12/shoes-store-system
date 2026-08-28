export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const SOCKET_EVENTS = {
  STOCK_UPDATED: 'stock:updated',
  SALE_CREATED: 'sale:created',
  SALE_CANCELLED: 'sale:cancelled',
  RETURN_CREATED: 'return:created',
  BRANCH_UPDATED: 'branch:updated',
  CONNECTION_STATUS: 'connection:status',
} as const;
