import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email({ message: 'Invalid email address' }),
    password: z.string().min(1, 'Password is required'),
    // Optional: a tenant slug can be supplied to disambiguate when the same
    // email pattern could theoretically collide across tenants (emails are
    // actually unique per-tenant, see Prisma schema @@unique([tenantId, email])).
    tenantSlug: z.string().trim().toLowerCase().optional(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain an uppercase letter')
        .regex(/[a-z]/, 'Password must contain a lowercase letter')
        .regex(/[0-9]/, 'Password must contain a digit'),
    }),
});

export type LoginInput = z.infer<typeof loginSchema>['body'];
