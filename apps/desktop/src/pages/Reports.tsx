import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader } from '../components/DataTable';

interface BestSizesColors {
  bestSizes: { label: string; quantity: number }[];
  bestColors: { label: string; quantity: number }[];
}

function Bar({ label, quantity, max }: { label: string; quantity: number; max: number }) {
  const pct = max > 0 ? Math.round((quantity / max) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{quantity}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [data, setData] = useState<BestSizesColors | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/reports/best-sizes-colors')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  return (
    <div>
      <PageHeader title="التقارير" />
      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {!data ? (
        <p className="text-slate-400">جارِ التحميل...</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold">الأكثر مبيعًا حسب المقاس</h3>
            {data.bestSizes.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد بيانات بعد</p>
            ) : (
              data.bestSizes.map((s) => <Bar key={s.label} label={s.label} quantity={s.quantity} max={data.bestSizes[0].quantity} />)
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold">الأكثر مبيعًا حسب اللون</h3>
            {data.bestColors.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد بيانات بعد</p>
            ) : (
              data.bestColors.map((c) => <Bar key={c.label} label={c.label} quantity={c.quantity} max={data.bestColors[0].quantity} />)
            )}
          </div>
        </div>
      )}
      <p className="mt-6 text-sm text-slate-400">
        لعرض المزيد من المؤشرات (المبيعات اليومية/الشهرية، المبيعات حسب الفرع، الأرباح) انتقل إلى{' '}
        <a href="/" className="text-brand-600 hover:underline">
          لوحة التحكم
        </a>
        .
      </p>
    </div>
  );
}
