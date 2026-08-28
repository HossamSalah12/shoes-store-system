import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Users2,
  UserSquare2,
  Receipt,
  RotateCcw,
  Wallet,
  BarChart3,
  UsersRound,
  ShieldCheck,
  Building2,
  Settings as SettingsIcon,
  CreditCard,
  ScrollText,
} from 'lucide-react';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, permission: PERMISSIONS.REPORT_VIEW_BRANCH },
  { to: '/pos', label: 'نقطة البيع', icon: ShoppingCart, permission: PERMISSIONS.POS_OPEN },
  { to: '/sales', label: 'المبيعات', icon: Receipt, permission: PERMISSIONS.SALE_VIEW },
  { to: '/returns', label: 'المرتجعات', icon: RotateCcw, permission: PERMISSIONS.RETURN_VIEW },
  { to: '/products', label: 'المنتجات', icon: Package, permission: PERMISSIONS.PRODUCT_VIEW },
  { to: '/inventory', label: 'المخزون', icon: Boxes, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: '/purchases', label: 'المشتريات', icon: Truck, permission: PERMISSIONS.PURCHASE_VIEW },
  { to: '/suppliers', label: 'الموردون', icon: Truck, permission: PERMISSIONS.SUPPLIER_VIEW },
  { to: '/customers', label: 'العملاء', icon: UserSquare2, permission: PERMISSIONS.CUSTOMER_VIEW },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, permission: PERMISSIONS.EXPENSE_VIEW },
  { to: '/reports', label: 'التقارير', icon: BarChart3, permission: PERMISSIONS.REPORT_VIEW_BRANCH },
  { to: '/users', label: 'المستخدمون', icon: UsersRound, permission: PERMISSIONS.USER_VIEW },
  { to: '/roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck, permission: PERMISSIONS.ROLE_MANAGE },
  { to: '/branches', label: 'الفروع', icon: Building2, permission: PERMISSIONS.BRANCH_VIEW },
  { to: '/subscription', label: 'الاشتراك', icon: CreditCard, permission: PERMISSIONS.SUBSCRIPTION_VIEW },
  { to: '/audit-log', label: 'سجل التدقيق', icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, permission: PERMISSIONS.SETTINGS_MANAGE },
];

export function Sidebar() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const user = useAuthStore((s) => s.user);

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission));

  return (
    <aside className="flex h-full w-64 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <Users2 className="text-brand-600" size={24} />
        <div>
          <div className="text-sm font-bold">{user?.tenantName ?? 'نظام إدارة المحلات'}</div>
          <div className="text-xs text-slate-500">{user?.fullName}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
