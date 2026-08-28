import { z } from 'zod';

export const stockAdjustmentSchema = z.object({
  body: z.object({
    variantId: z.string().cuid(),
    branchId: z.string().cuid(),
    quantityDelta: z.number().int().refine((v) => v !== 0, 'quantityDelta cannot be zero'),
    reason: z.string().trim().min(2).max(300),
  }),
});

export const stockTransferSchema = z.object({
  body: z.object({
    variantId: z.string().cuid(),
    fromBranchId: z.string().cuid(),
    toBranchId: z.string().cuid(),
    quantity: z.number().int().positive(),
    notes: z.string().trim().max(300).optional(),
  }),
});

export const lowStockQuerySchema = z.object({
  query: z.object({
    threshold: z.coerce.number().int().nonnegative().default(5),
    branchId: z.string().cuid().optional(),
  }),
});
