import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens';
import { buildAuthContext } from '../lib/authContext';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Requires a valid `Authorization: Bearer <accessToken>` header.
 *
 * Security notes:
 *  - The JWT signature + expiry is verified first (cheap, no DB hit for
 *    obviously invalid/expired tokens).
 *  - We then ALWAYS re-load the user's tenant/roles/permissions/branches
 *    from the database rather than trusting the JWT payload, so that a
 *    disabled tenant, deactivated user, or revoked permission takes effect
 *    on the very next request instead of waiting for token expiry.
 *  - req.authContext is the ONLY trusted source of tenantId/userId for every
 *    downstream handler. Nothing is ever read from the request body/query
 *    for authorization purposes.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthenticated('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw AppError.unauthenticated('Invalid or expired access token');
  }

  const context = await buildAuthContext(payload.sub);
  context.sessionId = payload.sessionId;

  req.authContext = context;
  next();
});
