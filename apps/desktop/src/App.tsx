import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './state/authStore';
import { useSettingsStore } from './state/settingsStore';
import { apiClient } from './api/client';
import { useRealtimeSocket } from './api/useRealtimeSocket';

import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { RequirePermission } from './components/RequirePermission';

import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { POSPage } from './pages/POS';
import { ProductsPage } from './pages/Products';
import { ProductDetailPage } from './pages/ProductDetail';
import { InventoryPage } from './pages/Inventory';
import { SalesPage } from './pages/Sales';
import { SaleDetailPage } from './pages/SaleDetail';
import { ReturnsPage } from './pages/Returns';
import { PurchasesPage } from './pages/Purchases';
import { SuppliersPage } from './pages/Suppliers';
import { CustomersPage } from './pages/Customers';
import { CustomerDetailPage } from './pages/CustomerDetail';
import { ExpensesPage } from './pages/Expenses';
import { ReportsPage } from './pages/Reports';
import { UsersPage } from './pages/Users';
import { RolesPage } from './pages/Roles';
import { BranchesPage } from './pages/Branches';
import { SettingsPage } from './pages/Settings';
import { SubscriptionPage } from './pages/Subscription';
import { AuditLogPage } from './pages/AuditLog';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboard';

import { PERMISSIONS } from '@shoes/shared';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);
  const [bootError, setBootError] = useState<string | null>(null);

  // Established once for the whole authenticated session (not per-page) —
  // this is what actually drives the connection indicator in TopBar and
  // gives individual pages (Inventory, Sales, Dashboard, Returns) a live
  // signal to refresh their data via useRealtimeStore's version counters.
  useRealtimeSocket();

  const setCurrency = useSettingsStore((s) => s.setCurrency);

  // Load tenant-wide display settings (currently: currency) once a
  // tenant-scoped user is authenticated. Super Admin has no tenant, so this
  // is skipped for that shell. Settings.tsx also calls setCurrency directly
  // on save, so a change takes effect immediately without waiting for this
  // effect to re-run.
  useEffect(() => {
    if (!accessToken || !user?.tenantId) return;
    apiClient
      .get('/api/settings')
      .then((res) => setCurrency(res.data.data.currency))
      .catch(() => {
        /* non-fatal — falls back to the store's default currency label */
      });
  }, [accessToken, user?.tenantId, setCurrency]);

  // On launch, attempt silent re-auth using the refresh token persisted in
  // the OS-encrypted secure store (see electron/main.ts safeStorage usage).
  useEffect(() => {
    async function bootstrap() {
      try {
        const storedRefreshToken = await window.desktopApi?.secureStorage.getRefreshToken();
        if (!storedRefreshToken) {
          setHydrated(true);
          return;
        }
        const response = await apiClient.post('/api/auth/refresh', { refreshToken: storedRefreshToken });
        const { accessToken: newAccess, refreshToken: newRefresh } = response.data.data;
        setTokens(newAccess, newRefresh);
        const meResponse = await apiClient.get('/api/auth/me', { headers: { Authorization: `Bearer ${newAccess}` } });
        setUser(meResponse.data.data);
      } catch {
        setBootError(null); // silent — user simply sees the login screen
      } finally {
        setHydrated(true);
      }
    }
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        جارِ التحميل...
      </div>
    );
  }

  if (!accessToken || !user) {
    return <LoginPage />;
  }

  // Platform-level Super Admin gets an entirely separate, simpler shell.
  if (user.tenantId === null) {
    return <SuperAdminDashboardPage />;
  }

  return (
    <AppLayout>
      {bootError && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-700">{bootError}</div>}
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/pos"
          element={
            <RequirePermission permission={PERMISSIONS.POS_OPEN}>
              <POSPage />
            </RequirePermission>
          }
        />
        <Route
          path="/sales"
          element={
            <RequirePermission permission={PERMISSIONS.SALE_VIEW}>
              <SalesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/sales/:saleId"
          element={
            <RequirePermission permission={PERMISSIONS.SALE_VIEW}>
              <SaleDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/returns"
          element={
            <RequirePermission permission={PERMISSIONS.RETURN_VIEW}>
              <ReturnsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/products"
          element={
            <RequirePermission permission={PERMISSIONS.PRODUCT_VIEW}>
              <ProductsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/products/:productId"
          element={
            <RequirePermission permission={PERMISSIONS.PRODUCT_VIEW}>
              <ProductDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW}>
              <InventoryPage />
            </RequirePermission>
          }
        />
        <Route
          path="/purchases"
          element={
            <RequirePermission permission={PERMISSIONS.PURCHASE_VIEW}>
              <PurchasesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/suppliers"
          element={
            <RequirePermission permission={PERMISSIONS.SUPPLIER_VIEW}>
              <SuppliersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/customers"
          element={
            <RequirePermission permission={PERMISSIONS.CUSTOMER_VIEW}>
              <CustomersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/customers/:customerId"
          element={
            <RequirePermission permission={PERMISSIONS.CUSTOMER_VIEW}>
              <CustomerDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="/expenses"
          element={
            <RequirePermission permission={PERMISSIONS.EXPENSE_VIEW}>
              <ExpensesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePermission permission={PERMISSIONS.REPORT_VIEW_BRANCH}>
              <ReportsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/users"
          element={
            <RequirePermission permission={PERMISSIONS.USER_VIEW}>
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/roles"
          element={
            <RequirePermission permission={PERMISSIONS.ROLE_MANAGE}>
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/branches"
          element={
            <RequirePermission permission={PERMISSIONS.BRANCH_VIEW}>
              <BranchesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePermission permission={PERMISSIONS.SETTINGS_MANAGE}>
              <SettingsPage />
            </RequirePermission>
          }
        />
        <Route path="/subscription" element={<SubscriptionPage />} />
        <Route
          path="/audit-log"
          element={
            <RequirePermission permission={PERMISSIONS.AUDIT_VIEW}>
              <AuditLogPage />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
