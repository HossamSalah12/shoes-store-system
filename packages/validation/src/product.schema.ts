import { z } from 'zod';

export const productVariantInputSchema = z.object({
  sizeId: z.string().cuid(),
  colorId: z.string().cuid(),
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().min(1).max(60).optional(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().positive(),
  initialStock: z.number().int().nonnegative().default(0),
});

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(150),
    brandId: z.string().cuid().optional(),
    categoryId: z.string().cuid().optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.string().trim().url().optional(),
    sku: z.string().trim().min(1).max(60),
    barcode: z.string().trim().max(60).optional(),
    costPrice: z.number().nonnegative(),
    sellingPrice: z.number().positive(),
    variants: z.array(productVariantInputSchema).default([]),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ productId: z.string().cuid() }),
  body: z.object({
    name: z.string().trim().min(1).max(150).optional(),
    brandId: z.string().cuid().nullable().optional(),
    categoryId: z.string().cuid().nullable().optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.string().trim().url().optional(),
    costPrice: z.number().nonnegative().optional(),
    sellingPrice: z.number().positive().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const addVariantSchema = z.object({
  params: z.object({ productId: z.string().cuid() }),
  body: productVariantInputSchema,
});

export const listProductsQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(150).optional(),
    brandId: z.string().cuid().optional(),
    categoryId: z.string().cuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
  }),
});
