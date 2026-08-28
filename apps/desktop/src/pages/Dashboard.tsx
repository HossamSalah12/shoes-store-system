import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { TrendingUp, Package, AlertTriangle, DollarSign } from 'lucide-react';
import { useRealtimeStore } from '../state/realtimeStore';
import { formatCurrency } from '../utils/currency';

interface DashboardData {
  todaySales: { total: number; count: number };
  monthlySales: { total: number; count: number };
  totalSales: { total: number; count: number };
  salesByBranch: { branchId: string; branchName: string; total: number }[];
  bestSellingProducts: { product: string; size?: string; color?: string; quantitySold: number }[];
  lowStockCount: number;
  stockValue: number;
  expenses: number;
  returns: number;
  estimatedProfit: number;
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ComponentType<{ size?: number }>; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <Icon size={18} />
      </div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stockVersion = useRealtimeStore((s) => s.stockVersion);
  const saleVersion = useRealtimeStore((s) => s.saleVersion);

  useEffect(() => {
    apiClient
      .get('/api/reports/dashboard')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [stockVersion, saleVersion]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!data) return <p className="text-slate-400">جارِ التحميل...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="مبيعات اليوم" value={formatCurrency(data.todaySales.total)} icon={TrendingUp} tone="text-emerald-600" />
        <StatCard label="مبيعات الشهر" value={formatCurrency(data.monthlySales.total)} icon={TrendingUp} tone="text-brand-600" />
        <StatCard label="قيمة المخزون" value={formatCurrency(data.stockValue)} icon={Package} tone="text-slate-700" />
        <StatCard label="مخزون منخفض" value={`${data.lowStockCount} صنف`} icon={AlertTriangle} tone="text-amber-600" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="إجمالي المصروفات" value={formatCurrency(data.expenses)} icon={DollarSign} tone="text-red-600" />
        <StatCard label="إجمالي المرتجعات" value={formatCurrency(data.returns)} icon={DollarSign} tone="text-red-600" />
        <StatCard label="الربح التقديري" value={formatCurrency(data.estimatedProfit)} icon={DollarSign} tone="text-emerald-700" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold">المبيعات حسب الفرع</h3>
          <div className="space-y-2">
            {data.salesByBranch.length === 0 && <p className="text-sm text-slate-400">لا توجد بيانات بعد</p>}
            {data.salesByBranch.map((b) => (
              <div key={b.branchId} className="flex items-center justify-between text-sm">
                <span>{b.branchName}</span>
                <span className="font-semibold">{formatCurrency(b.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold">الأكثر مبيعًا</h3>
          <div className="space-y-2">
            {data.bestSellingProducts.length === 0 && <p className="text-sm text-slate-400">لا توجد بيانات بعد</p>}
            {data.bestSellingProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>
                  {p.product} {p.size && `· ${p.size}`} {p.color && `· ${p.color}`}
                </span>
                <span className="font-semibold">{p.quantitySold}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
