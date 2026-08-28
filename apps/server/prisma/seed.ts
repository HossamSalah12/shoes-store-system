/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLES } from '@shoes/shared';

const prisma = new PrismaClient();

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'platform.manage_tenants': 'Create, update, enable and disable tenants',
  'platform.manage_plans': 'Manage subscription plans',
  'platform.manage_subscriptions': 'Manage tenant subscriptions',
  'platform.view_statistics': 'View platform-wide statistics',
  'branch.create': 'Create a branch',
  'branch.update': 'Update a branch',
  'branch.delete': 'Delete or deactivate a branch',
  'branch.view': 'View branches',
  'user.create': 'Create a user',
  'user.update': 'Update a user',
  'user.delete': 'Deactivate a user',
  'user.view': 'View users',
  'role.manage': 'Manage roles and permissions',
  'product.create': 'Create products/variants',
  'product.update': 'Update products/variants',
  'product.delete': 'Delete/deactivate products',
  'product.view': 'View products',
  'inventory.view': 'View stock levels',
  'inventory.adjust': 'Manually adjust stock',
  'inventory.transfer': 'Transfer stock between branches',
  'purchase.create': 'Create purchases from suppliers',
  'purchase.view': 'View purchases',
  'supplier.manage': 'Create/update suppliers',
  'supplier.view': 'View suppliers',
  'customer.manage': 'Create/update customers',
  'customer.view': 'View customers',
  'pos.open': 'Open the POS screen',
  'sale.create': 'Create a sale',
  'sale.view': 'View sales',
  'sale.apply_discount': 'Apply a discount on a sale',
  'sale.cancel': 'Cancel a sale',
  'return.create': 'Create a return',
  'return.view': 'View returns',
  'expense.create': 'Record an expense',
  'expense.view': 'View expenses',
  'report.view_branch': 'View branch-level reports',
  'report.view_tenant': 'View tenant-wide reports',
  'settings.manage': 'Manage tenant settings',
  'subscription.view': 'View subscription status',
  'audit.view': 'View audit logs',
};

async function seedPermissions() {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: PERMISSION_DESCRIPTIONS[key] ?? key },
    });
  }
  console.log(`Seeded ${ALL_PERMISSIONS.length} permissions.`);
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@shoes-system.local';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findFirst({ where: { email, tenantId: null } });
  if (existing) {
    console.log('Super Admin already exists, skipping.');
    return;
  }

  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const role = await prisma.role.create({
    data: { tenantId: null, code: ROLES.SUPER_ADMIN, name: 'Super Admin', isSystem: true },
  });

  await prisma.rolePermission.createMany({
    data: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN
      .map((key) => permissionByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId })),
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { tenantId: null, fullName: 'Platform Super Admin', email, passwordHash, isActive: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  console.log(`Created Super Admin: ${email} (password from SUPER_ADMIN_PASSWORD env var)`);
}

async function seedDefaultPlans() {
  const count = await prisma.plan.count();
  if (count > 0) return;

  await prisma.plan.createMany({
    data: [
      { name: 'Starter', maxBranches: 1, maxUsers: 5, durationDays: 30, priceCents: 0, features: ['pos', 'inventory'] },
      { name: 'Growth', maxBranches: 5, maxUsers: 25, durationDays: 30, priceCents: 4900, features: ['pos', 'inventory', 'reports', 'multi-branch'] },
      { name: 'Enterprise', maxBranches: 999, maxUsers: 999, durationDays: 30, priceCents: 14900, features: ['pos', 'inventory', 'reports', 'multi-branch', 'priority-support'] },
    ],
  });
  console.log('Seeded default subscription plans.');
}

/**
 * Demo data — creates two isolated tenants (Hussein / Mohamed, matching the
 * spec's acceptance-test scenario) ONLY when SEED_DEMO_DATA=true. This is
 * intentionally opt-in so a production seed run never creates sample
 * businesses.
 */
async function seedDemoTenants() {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log('SEED_DEMO_DATA is not "true" — skipping demo tenants.');
    return;
  }

  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  async function createDemoTenant(name: string, slug: string, ownerEmail: string, branchNames: string[]) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      console.log(`Demo tenant "${slug}" already exists, skipping.`);
      return;
    }

    const tenant = await prisma.tenant.create({ data: { name, slug, status: 'ACTIVE' } });
    await prisma.settings.create({ data: { tenantId: tenant.id } });

    const roleIdByCode = new Map<string, string>();
    for (const code of ['OWNER', 'BRANCH_MANAGER', 'CASHIER'] as const) {
      const role = await prisma.role.create({ data: { tenantId: tenant.id, code, name: code, isSystem: true } });
      roleIdByCode.set(code, role.id);
      await prisma.rolePermission.createMany({
        data: DEFAULT_ROLE_PERMISSIONS[code]
          .map((key) => permissionByKey.get(key))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }

    const passwordHash = await bcrypt.hash('Owner@12345', 12);
    const owner = await prisma.user.create({
      data: { tenantId: tenant.id, fullName: `${name} Owner`, email: ownerEmail, passwordHash, isActive: true },
    });
    await prisma.userRole.create({ data: { userId: owner.id, roleId: roleIdByCode.get('OWNER')! } });

    for (const branchName of branchNames) {
      await prisma.branch.create({ data: { tenantId: tenant.id, name: branchName } });
    }

    console.log(`Created demo tenant "${slug}" with owner ${ownerEmail} / password: Owner@12345`);
  }

  await createDemoTenant('Hussein Shoes', 'hussein', 'owner@hussein.demo', ['Cairo', 'Alexandria', 'Mansoura']);
  await createDemoTenant('Mohamed Shoes', 'mohamed', 'owner@mohamed.demo', ['Giza', 'Tanta', 'Zagazig', 'Asyut']);
}

async function main() {
  await seedPermissions();
  await seedDefaultPlans();
  await seedSuperAdmin();
  await seedDemoTenants();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
