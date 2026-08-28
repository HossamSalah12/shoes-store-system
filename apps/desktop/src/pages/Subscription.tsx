import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader } from '../components/DataTable';

interface Subscription {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  plan: { name: string; maxBranches: number; maxUsers: number; features: string[] };
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  TRIAL: { label: 'تجريبي', tone: 'bg-blue-50 text-blue-700' },
  ACTIVE: { label: 'نشط', tone: 'bg-emerald-50 text-emerald-700' },
  EXPIRED: { label: 'منتهي', tone: 'bg-red-50 text-red-700' },
  SUSPENDED: { label: 'موقوف', tone: 'bg-amber-50 text-amber-700' },
};

export function SubscriptionPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Tenant-scoped users only ever see their own tenant's subscriptions —
    // the backend derives tenantId from the authenticated session, never
    // from a query parameter, so this call cannot leak another tenant's
    // billing/subscription data.
    apiClient
      .get('/api/subscription')
      .then((res) => setSubscriptions(res.data.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, []);

  return (
    <div>
      <PageHeader title="الاشتراك" />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {subscriptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          لا توجد بيانات اشتراك متاحة لعرضها هنا. للاستفسار عن خطتك الحالية، تواصل مع مسؤول المنصة.
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">{s.plan.name}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABELS[s.status]?.tone}`}>
                  {STATUS_LABELS[s.status]?.label ?? s.status}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                من {new Date(s.startDate).toLocaleDateString('ar-EG')} إلى {new Date(s.endDate).toLocaleDateString('ar-EG')}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                حتى {s.plan.maxBranches} فرع، {s.plan.maxUsers} مستخدم
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
