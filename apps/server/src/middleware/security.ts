import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AnyZodObject } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export const securityHeaders = helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow same-origin / server-to-server (no Origin header) requests, and
    // requests from the desktop client's whitelisted origins.
    if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
});

/** Tighter limiter specifically for auth endpoints to slow brute-force attempts. */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } },
});

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/**
 * Validates req.body/req.params/req.query against a Zod schema shaped like
 * `{ body?, params?, query? }` and replaces them with the parsed (and
 * coerced/trimmed) values, so every downstream handler only ever sees
 * sanitized input.
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      throw AppError.validation('Invalid request', result.error.flatten());
    }
    const parsed = result.data as Record<string, unknown>;
    if (parsed.body) req.body = parsed.body;
    if (parsed.params) req.params = parsed.params as any;
    if (parsed.query) req.query = parsed.query as any;
    next();
  };
}
