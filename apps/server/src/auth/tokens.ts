import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { JwtAccessTokenPayload, JwtRefreshTokenPayload } from '@shoes/shared';
import { env } from '../config/env';

export function signAccessToken(payload: Omit<JwtAccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): JwtAccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function signRefreshToken(payload: Omit<JwtRefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyRefreshToken(token: string): JwtRefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

/**
 * Refresh tokens are stored server-side only as a SHA-256 hash (in
 * Session.refreshTokenHash), the same way we'd store a password — this way a
 * leaked database dump does not let an attacker replay refresh tokens
 * directly, and a compromised session can be revoked server-side at any
 * time regardless of the JWT's own expiry.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
