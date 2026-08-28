import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { buildAuthContext } from '../lib/authContext';
import { hashPassword, verifyPassword } from './password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from './tokens';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { recordAudit } from '../modules/audit/audit.service';

interface LoginParams {
  email: string;
  password: string;
  tenantSlug?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function findUserForLogin(email: string, tenantSlug?: string) {
  if (tenantSlug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return null;
    return prisma.user.findFirst({ where: { email, tenantId: tenant.id } });
  }
  // No tenant slug supplied: try platform-level user first (SUPER_ADMIN),
  // then fall back to the first matching tenant user. In production, the
  // desktop client always supplies tenantSlug for tenant logins to avoid
  // ambiguity when the same email is reused across tenants.
  const platformUser = await prisma.user.findFirst({ where: { email, tenantId: null } });
  if (platformUser) return platformUser;
  return prisma.user.findFirst({ where: { email } });
}

export async function login(params: LoginParams): Promise<TokenPair & { user: unknown }> {
  const user = await findUserForLogin(params.email, params.tenantSlug);

  if (!user) {
    // Constant-shape response to avoid user enumeration; verifyPassword
    // against a dummy hash keeps timing roughly consistent either way.
    await verifyPassword(params.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid');
    throw AppError.invalidCredentials();
  }

  if (!user.isActive) {
    throw AppError.invalidCredentials('This account has been deactivated');
  }

  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw AppError.tenantDisabled();
    }
  }

  const validPassword = await verifyPassword(params.password, user.passwordHash);
  if (!validPassword) {
    throw AppError.invalidCredentials();
  }

  const sessionId = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, sessionId });
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      expiresAt,
    },
  });

  const ctx = await buildAuthContext(user.id);
  ctx.sessionId = sessionId;

  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: ctx.tenantId,
    sessionId,
    roles: ctx.roleCodes,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id,
    ipAddress: params.ipAddress,
  });

  // Platform-level Super Admin has no tenant; tenant-scoped users get their
  // store's real display name (e.g. "Hussein Shoes") rather than a generic
  // placeholder, for use in the desktop UI (receipts, dashboards, etc.).
  const tenantName = user.tenantId
    ? (await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }))?.name
    : undefined;

  const { passwordHash: _omit, ...safeUser } = user;

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: { ...safeUser, permissions: ctx.permissions, roles: ctx.roleCodes, branchIds: ctx.branchIds, tenantName },
  };
}

export async function refresh(refreshToken: string, ipAddress?: string): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthenticated('Invalid or expired refresh token');
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw AppError.unauthenticated('Session expired or revoked');
  }

  if (session.refreshTokenHash !== hashToken(refreshToken)) {
    // Token doesn't match what we have on file — possible token theft /
    // replay of an old rotated token. Revoke the session defensively.
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw AppError.unauthenticated('Refresh token mismatch, session revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
    throw AppError.unauthenticated();
  }

  // Rotate the refresh token on every use (defense against replay of a
  // stolen-but-not-yet-used token).
  const newRefreshToken = signRefreshToken({ sub: user.id, sessionId: session.id });
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(newRefreshToken), ipAddress: ipAddress ?? session.ipAddress },
  });

  const ctx = await buildAuthContext(user.id);
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: ctx.tenantId,
    sessionId: session.id,
    roles: ctx.roleCodes,
  });

  return { accessToken, refreshToken: newRefreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw AppError.invalidCredentials('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Revoke all other sessions on password change.
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await recordAudit({ tenantId: user.tenantId, userId, action: 'auth.change_password', entityType: 'User', entityId: userId });
}
