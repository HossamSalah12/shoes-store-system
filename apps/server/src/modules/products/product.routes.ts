import { Router } from 'express';
import { z } from 'zod';
import { createProductSchema, updateProductSchema, addVariantSchema, listProductsQuerySchema } from '@shoes/validation';
import { PERMISSIONS } from '@shoes/shared';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireTenantUser } from '../../middleware/authorize';
import { validate } from '../../middleware/security';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, paginated } from '../../utils/apiResponse';
import * as productService from './product.service';

export const productRouter = Router();

productRouter.use(authenticate, requireTenantUser);

productRouter.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  validate(listProductsQuerySchema),
  asyncHandler(async (req, res) => {
    const { search, brandId, categoryId, page, pageSize } = req.query as any;
    const { items, total } = await productService.listProducts(req.authContext!.tenantId!, {
      search,
      brandId,
      categoryId,
      page,
      pageSize,
    });
    return paginated(res, items, total, page, pageSize);
  }),
);

productRouter.get(
  '/lookup/:code',
  requirePermission(PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.POS_OPEN),
  asyncHandler(async (req, res) => {
    const variant = await productService.findVariantByBarcodeOrSku(req.authContext!.tenantId!, req.params.code);
    return ok(res, variant);
  }),
);

productRouter.get(
  '/:productId',
  requirePermission(PERMISSIONS.PRODUCT_VIEW),
  asyncHandler(async (req, res) => {
    const product = await productService.getProduct(req.authContext!.tenantId!, req.params.productId);
    return ok(res, product);
  }),
);

productRouter.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_CREATE),
  validate(createProductSchema),
  asyncHandler(async (req, res) => {
    const product = await productService.createProduct(req.authContext!.tenantId!, req.body, req.authContext!.userId);
    return created(res, product);
  }),
);

productRouter.patch(
  '/:productId',
  requirePermission(PERMISSIONS.PRODUCT_UPDATE),
  validate(updateProductSchema),
  asyncHandler(async (req, res) => {
    const product = await productService.updateProduct(
      req.authContext!.tenantId!,
      req.params.productId,
      req.body,
      req.authContext!.userId,
    );
    return ok(res, product);
  }),
);

productRouter.post(
  '/:productId/variants',
  requirePermission(PERMISSIONS.PRODUCT_UPDATE),
  validate(addVariantSchema),
  asyncHandler(async (req, res) => {
    const variant = await productService.addVariant(
      req.authContext!.tenantId!,
      req.params.productId,
      req.body,
      req.authContext!.userId,
    );
    return created(res, variant);
  }),
);

// --- Lookups: brands / categories / colors / sizes ---
const nameBody = z.object({ body: z.object({ name: z.string().trim().min(1).max(100), hexCode: z.string().optional(), sortOrder: z.number().int().optional() }) });

productRouter.get('/meta/brands', requirePermission(PERMISSIONS.PRODUCT_VIEW), asyncHandler(async (req, res) => ok(res, await productService.listBrands(req.authContext!.tenantId!))));
productRouter.post('/meta/brands', requirePermission(PERMISSIONS.PRODUCT_CREATE), validate(nameBody), asyncHandler(async (req, res) => created(res, await productService.createBrand(req.authContext!.tenantId!, req.body.name))));

productRouter.get('/meta/categories', requirePermission(PERMISSIONS.PRODUCT_VIEW), asyncHandler(async (req, res) => ok(res, await productService.listCategories(req.authContext!.tenantId!))));
productRouter.post('/meta/categories', requirePermission(PERMISSIONS.PRODUCT_CREATE), validate(nameBody), asyncHandler(async (req, res) => created(res, await productService.createCategory(req.authContext!.tenantId!, req.body.name))));

productRouter.get('/meta/colors', requirePermission(PERMISSIONS.PRODUCT_VIEW), asyncHandler(async (req, res) => ok(res, await productService.listColors(req.authContext!.tenantId!))));
productRouter.post('/meta/colors', requirePermission(PERMISSIONS.PRODUCT_CREATE), validate(nameBody), asyncHandler(async (req, res) => created(res, await productService.createColor(req.authContext!.tenantId!, req.body.name, req.body.hexCode))));

productRouter.get('/meta/sizes', requirePermission(PERMISSIONS.PRODUCT_VIEW), asyncHandler(async (req, res) => ok(res, await productService.listSizes(req.authContext!.tenantId!))));
productRouter.post('/meta/sizes', requirePermission(PERMISSIONS.PRODUCT_CREATE), validate(nameBody), asyncHandler(async (req, res) => created(res, await productService.createSize(req.authContext!.tenantId!, req.body.name, req.body.sortOrder ?? 0))));
