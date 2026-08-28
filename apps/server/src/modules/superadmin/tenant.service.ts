import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { hashPassword } from '../../auth/password';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '@shoes/shared';
import { recordAudit } from '../audit/audit.service';

interface CreateTenantParams {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  planId?: string;
  actingUserId: string | null;
}

/**
 * Provisions a brand new, fully isolated tenant: the Tenant row, its four
 * system Roles (each scoped to this tenant via tenantId) seeded with the
 * default permission set, the Owner user, default Settings row, and (if a
 * plan is supplied) an initial TRIAL/ACTIVE subscription. Everything happens
 * inside one DB transaction so a partially-created tenant can never exist.
 */
export async function createTenant(params: CreateTenantParams) {
  const existingSlug = await prisma.tenant.findUnique({ where: { slug: params.slug } });
  if (existingSlug) throw AppError.conflict('A tenant with this slug already exists');

  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const passwordHash = await hashPassword(params.ownerPassword);

  const tenant = await prisma.$transaction(async (tx) => {
    const createdTenant = await tx.tenant.create({
      data: { name: params.name, slug: params.slug, status: 'ACTIVE' },
    });

    await tx.settings.create({ data: { tenantId: createdTenant.id } });

    // Seed the three tenant-scoped system roles (OWNER, BRANCH_MANAGER, CASHIER).
    const roleCodes: Array<Exclude<keyof typeof DEFAULT_ROLE_PERMISSIONS, 'SUPER_ADMIN'>> = [
      'OWNER',
      'BRANCH_MANAGER',
      'CASHIER',
    ];
    const roleIdByCode = new Map<string, string>();
    for (const code of roleCodes) {
      const role = await tx.role.create({
        data: { tenantId: createdTenant.id, code, name: code.replace('_', ' '), isSystem: true },
      });
      roleIdByCode.set(code, role.id);
      const keys = DEFAULT_ROLE_PERMISSIONS[code];
      await tx.rolePermission.createMany({
        data: keys
          .map((key) => permissionByKey.get(key))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }

    const owner = await tx.user.create({
      data: {
        tenantId: createdTenant.id,
        fullName: params.ownerName,
        email: params.ownerEmail,
        passwordHash,
        isActive: true,
      },
    });

    const ownerRoleId = roleIdByCode.get(ROLES.OWNER)!;
    await tx.userRole.create({ data: { userId: owner.id, roleId: ownerRoleId } });

    if (params.planId) {
      const plan = await tx.plan.findUnique({ where: { id: params.planId } });
      if (plan) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.durationDays);
        await tx.subscription.create({
          data: { tenantId: createdTenant.id, planId: plan.id, status: 'TRIAL', endDate },
        });
      }
    }

    return createdTenant;
  });

  await recordAudit({
    tenantId: null,
    userId: params.actingUserId,
    action: 'platform.tenant.create',
    entityType: 'Tenant',
    entityId: tenant.id,
    metadata: { slug: tenant.slug },
  });

  return tenant;
}

export async function listTenants(page: number, pageSize: number, status?: 'ACTIVE' | 'DISABLED') {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { branches: true, users: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.tenant.count({ where }),
  ]);
  return { items, total };
}

export async function getTenantDetails(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      branches: true,
      _count: { select: { users: true, sales: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 5, include: { plan: true } },
    },
  });
  if (!tenant) throw AppError.notFound('Tenant not found');
  return tenant;
}

export async function setTenantStatus(tenantId: string, status: 'ACTIVE' | 'DISABLED', actingUserId: string | null) {
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  await recordAudit({
    tenantId: null,
    userId: actingUserId,
    action: status === 'DISABLED' ? 'platform.tenant.disable' : 'platform.tenant.enable',
    entityType: 'Tenant',
    entityId: tenantId,
  });
  return tenant;
}

export async function updateTenant(tenantId: string, data: { name?: string; status?: 'ACTIVE' | 'DISABLED' }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw AppError.notFound('Tenant not found');
  return prisma.tenant.update({ where: { id: tenantId }, data });
}

export async function getPlatformStatistics() {
  const [totalTenants, activeTenants, disabledTenants, totalBranches, totalUsers, activeSubscriptions] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'DISABLED' } }),
      prisma.branch.count(),
      prisma.user.count({ where: { tenantId: { not: null } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    ]);
  return { totalTenants, activeTenants, disabledTenants, totalBranches, totalUsers, activeSubscriptions };
}
