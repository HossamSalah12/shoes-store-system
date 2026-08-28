import { z } from 'zod';

export const createSupplierSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const recordSupplierPaymentSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    method: z.string().trim().max(50).optional(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  }),
});

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const purchaseItemInputSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
});

export const createPurchaseSchema = z.object({
  body: z.object({
    branchId: z.string().cuid(),
    supplierId: z.string().cuid(),
    items: z.array(purchaseItemInputSchema).min(1),
    notes: z.string().trim().max(500).optional(),
  }),
});

export const createExpenseSchema = z.object({
  body: z.object({
    branchId: z.string().cuid(),
    category: z.string().trim().min(2).max(80),
    amount: z.number().positive(),
    date: z.coerce.date().default(() => new Date()),
    description: z.string().trim().max(500).optional(),
  }),
});

export const createPlanSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    maxBranches: z.number().int().positive(),
    maxUsers: z.number().int().positive(),
    durationDays: z.number().int().positive(),
    priceCents: z.number().int().nonnegative(),
    features: z.array(z.string()).default([]),
  }),
});

export const createSubscriptionSchema = z.object({
  body: z.object({
    tenantId: z.string().cuid(),
    planId: z.string().cuid(),
    startDate: z.coerce.date().default(() => new Date()),
  }),
});
