import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { assertTenantOwnership } from '../../lib/tenantGuard';
import { recordAudit } from '../audit/audit.service';

interface VariantInput {
  sizeId: string;
  colorId: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  initialStock: number;
}

interface CreateProductInput {
  name: string;
  brandId?: string;
  categoryId?: string;
  description?: string;
  imageUrl?: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  variants: VariantInput[];
}

export async function listProducts(
  tenantId: string,
  filters: { search?: string; brandId?: string; categoryId?: string; page: number; pageSize: number },
) {
  const where = {
    tenantId,
    isActive: true,
    ...(filters.brandId ? { brandId: filters.brandId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { sku: { contains: filters.search, mode: 'insensitive' as const } },
            { barcode: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: true, variants: { include: { size: true, color: true } } },
      orderBy: { name: 'asc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export async function getProduct(tenantId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true, category: true, variants: { include: { size: true, color: true } } },
  });
  return assertTenantOwnership(product, tenantId, 'Product not found');
}

/** Finds a variant by barcode (or SKU) for POS scanning — always tenant-scoped. */
export async function findVariantByBarcodeOrSku(tenantId: string, code: string) {
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, isActive: true, OR: [{ barcode: code }, { sku: code }] },
    include: { product: true, size: true, color: true },
  });
  if (!variant) throw AppError.notFound('No product variant found for this barcode/SKU');
  return variant;
}

export async function createProduct(tenantId: string, data: CreateProductInput, actingUserId: string) {
  const existingSku = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId, sku: data.sku } } });
  if (existingSku) throw AppError.conflict('A product with this SKU already exists');

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        tenantId,
        name: data.name,
        brandId: data.brandId,
        categoryId: data.categoryId,
        description: data.description,
        imageUrl: data.imageUrl,
        sku: data.sku,
        barcode: data.barcode,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
      },
    });

    for (const v of data.variants) {
      const variant = await tx.productVariant.create({
        data: {
          tenantId,
          productId: created.id,
          sizeId: v.sizeId,
          colorId: v.colorId,
          sku: v.sku,
          barcode: v.barcode,
          costPrice: v.costPrice,
          sellingPrice: v.sellingPrice,
        },
      });

      // NOTE: `initialStock` on a variant is intentionally NOT auto-applied
      // to any branch here. Stock is always branch-specific, and guessing
      // "the first branch" would be wrong for a multi-branch tenant. Callers
      // that want to seed opening stock must call
      // inventory.service.adjustStock(tenantId, branchId, ...) explicitly
      // (e.g. right after creating the product, once per branch that should
      // carry it). `initialStock` remains in the schema/DTO purely so the
      // desktop "New Product" wizard can capture the intended opening
      // quantity and immediately follow up with the appropriate per-branch
      // adjustment calls.
      void v.initialStock;
    }

    return created;
  });

  await recordAudit({ tenantId, userId: actingUserId, action: 'product.create', entityType: 'Product', entityId: product.id });
  return getProduct(tenantId, product.id);
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  data: Partial<{ name: string; brandId: string | null; categoryId: string | null; description: string; imageUrl: string; costPrice: number; sellingPrice: number; isActive: boolean }>,
  actingUserId: string,
) {
  await getProduct(tenantId, productId);
  const product = await prisma.product.update({ where: { id: productId }, data });
  await recordAudit({ tenantId, userId: actingUserId, action: 'product.update', entityType: 'Product', entityId: productId, metadata: data });
  return product;
}

export async function addVariant(tenantId: string, productId: string, input: VariantInput, actingUserId: string) {
  await getProduct(tenantId, productId); // ownership check
  const existing = await prisma.productVariant.findUnique({ where: { tenantId_sku: { tenantId, sku: input.sku } } });
  if (existing) throw AppError.conflict('A variant with this SKU already exists');

  const variant = await prisma.productVariant.create({
    data: {
      tenantId,
      productId,
      sizeId: input.sizeId,
      colorId: input.colorId,
      sku: input.sku,
      barcode: input.barcode,
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
    },
  });
  await recordAudit({ tenantId, userId: actingUserId, action: 'product.add_variant', entityType: 'ProductVariant', entityId: variant.id });
  return variant;
}

// --- Simple lookups (Brands, Categories, Colors, Sizes) ---

export async function listBrands(tenantId: string) {
  return prisma.brand.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
}
export async function createBrand(tenantId: string, name: string) {
  return prisma.brand.create({ data: { tenantId, name } });
}
export async function listCategories(tenantId: string) {
  return prisma.category.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
}
export async function createCategory(tenantId: string, name: string) {
  return prisma.category.create({ data: { tenantId, name } });
}
export async function listColors(tenantId: string) {
  return prisma.color.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
}
export async function createColor(tenantId: string, name: string, hexCode?: string) {
  return prisma.color.create({ data: { tenantId, name, hexCode } });
}
export async function listSizes(tenantId: string) {
  return prisma.size.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } });
}
export async function createSize(tenantId: string, label: string, sortOrder = 0) {
  return prisma.size.create({ data: { tenantId, label, sortOrder } });
}
