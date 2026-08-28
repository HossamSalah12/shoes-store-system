import express from 'express';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import {
  securityHeaders,
  corsMiddleware,
  globalRateLimiter,
  requestIdMiddleware,
} from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import { authRouter } from './auth/auth.routes';
import { superAdminRouter } from './modules/superadmin/superadmin.routes';
import { branchRouter } from './modules/branches/branch.routes';
import { userRouter } from './modules/users/user.routes';
import { roleRouter } from './modules/roles/role.routes';
import { productRouter } from './modules/products/product.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { supplierRouter } from './modules/suppliers/supplier.routes';
import { customerRouter } from './modules/customers/customer.routes';
import { purchaseRouter } from './modules/purchases/purchase.routes';
import { saleRouter } from './modules/sales/sale.routes';
import { returnRouter } from './modules/returns/return.routes';
import { expenseRouter } from './modules/expenses/expense.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { reportRouter } from './modules/reports/report.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { tenantSubscriptionRouter } from './modules/subscriptions/tenantSubscription.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // needed for correct req.ip behind a reverse proxy in production

  app.use(requestIdMiddleware);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as any).requestId }),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(globalRateLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Platform-level (Super Admin only)
  app.use('/api/platform', superAdminRouter);

  // Tenant-scoped
  app.use('/api/auth', authRouter);
  app.use('/api/branches', branchRouter);
  app.use('/api/users', userRouter);
  app.use('/api/roles', roleRouter);
  app.use('/api/products', productRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/suppliers', supplierRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/purchases', purchaseRouter);
  app.use('/api/sales', saleRouter);
  app.use('/api/returns', returnRouter);
  app.use('/api/expenses', expenseRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/subscription', tenantSubscriptionRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
