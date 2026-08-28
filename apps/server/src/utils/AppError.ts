export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TENANT_DISABLED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TENANT_DISABLED: 403,
  SUBSCRIPTION_INACTIVE: 402,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Application-level error. Route handlers/services should throw this
 * instead of generic Errors so the central error handler can return a
 * consistent, safe JSON shape without ever leaking internals (stack traces,
 * SQL, Prisma error details) to the client.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static validation(message: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', message, details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new AppError('UNAUTHENTICATED', message);
  }
  static invalidCredentials(message = 'Invalid email or password') {
    return new AppError('INVALID_CREDENTIALS', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new AppError('CONFLICT', message);
  }
  static tenantDisabled(message = 'This tenant account has been disabled') {
    return new AppError('TENANT_DISABLED', message);
  }
  static subscriptionInactive(message = 'Subscription is not active') {
    return new AppError('SUBSCRIPTION_INACTIVE', message);
  }
}
