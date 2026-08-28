import { z } from 'zod';

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
    ownerName: z.string().trim().min(2).max(120),
    ownerEmail: z.string().trim().toLowerCase().email(),
    ownerPassword: z.string().min(8),
    planId: z.string().cuid().optional(),
  }),
});

export const updateTenantSchema = z.object({
  params: z.object({ tenantId: z.string().cuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  }),
});

export const createBranchSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(30).optional(),
  }),
});

export const updateBranchSchema = z.object({
  params: z.object({ branchId: z.string().cuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(30).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8),
    roleId: z.string().cuid(),
    branchIds: z.array(z.string().cuid()).default([]),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ userId: z.string().cuid() }),
  body: z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    roleId: z.string().cuid().optional(),
    branchIds: z.array(z.string().cuid()).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    permissions: z.array(z.string()).default([]),
  }),
});

export const updateRolePermissionsSchema = z.object({
  params: z.object({ roleId: z.string().cuid() }),
  body: z.object({
    permissions: z.array(z.string()),
  }),
});
