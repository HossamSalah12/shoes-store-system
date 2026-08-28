import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { LogOut, Building2 } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  _count: { branches: number; users: number };
}

interface Plan {
  id: string;
  name: string;
  maxBranches: number;
  maxUsers: number;
  durationDays: number;
  priceCents: number;
  features: string[];
}

interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  startDate: string;
  endDate: string;
  plan: { id: string; name: string };
  tenant: { id: string; name: string; slug: string };
}

const SUBSCRIPTION_STATUS_LABELS: Record<Subscription['status'], { label: string; tone: string }> = {
  TRIAL: { label: 'تجريبي', tone: 'text-blue-600' },
  ACTIVE: { label: 'نشط', tone: 'text-emerald-600' },
  EXPIRED: { label: 'منتهي', tone: 'text-red-600' },
  SUSPENDED: { label: 'موقوف', tone: 'text-amber-600' },
};

interface Stats {
  totalTenants: number;
  activeTenants: number;
  disabledTenants: number;
  totalBranches: number;
  totalUsers: number;
  activeSubscriptions: number;
}

export function SuperAdminDashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createSubscriptionOpen, setCreateSubscriptionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearSession = useAuthStore((s) => s.clearSession);
  const user = useAuthStore((s) => s.user);

  async function load() {
    try {
      const [tenantsRes, statsRes, plansRes, subscriptionsRes] = await Promise.all([
        apiClient.get('/api/platform/tenants', { params: { pageSize: 100 } }),
        apiClient.get('/api/platform/statistics'),
        apiClient.get('/api/platform/plans'),
        apiClient.get('/api/platform/subscriptions'),
      ]);
      setTenants(tenantsRes.data.data.items);
      setStats(statsRes.data.data);
      setPlans(plansRes.data.data);
      setSubscriptions(subscriptionsRes.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(tenant: Tenant) {
    try {
      const action = tenant.status === 'ACTIVE' ? 'disable' : 'enable';
      await apiClient.post(`/api/platform/tenants/${tenant.id}/${action}`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  async function suspendSubscription(subscriptionId: string) {
    if (!confirm('هل أنت متأكد من إيقاف هذا الاشتراك؟')) return;
    try {
      await apiClient.post(`/api/platform/subscriptions/${subscriptionId}/suspend`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="text-brand-600" />
          <div>
            <div className="font-bold">لوحة تحكم المنصة</div>
            <div className="text-xs text-slate-500">{user?.fullName}</div>
          </div>
        </div>
        <button onClick={clearSession} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut size={16} /> تسجيل الخروج
        </button>
      </header>

      <main className="space-y-8 p-6">
        {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}

        {stats && (
          <div className="grid grid-cols-6 gap-4">
            <StatCard label="إجمالي المتاجر" value={stats.totalTenants} />
            <StatCard label="متاجر نشطة" value={stats.activeTenants} tone="text-emerald-600" />
            <StatCard label="متاجر موقوفة" value={stats.disabledTenants} tone="text-red-600" />
            <StatCard label="إجمالي الفروع" value={stats.totalBranches} />
            <StatCard label="إجمالي المستخدمين" value={stats.totalUsers} />
            <StatCard label="اشتراكات نشطة" value={stats.activeSubscriptions} tone="text-brand-600" />
          </div>
        )}

        <section>
          <PageHeader title="المتاجر (Tenants)" action={<PrimaryButton onClick={() => setCreateTenantOpen(true)}>+ متجر جديد</PrimaryButton>} />
          <DataTable
            rows={tenants}
            columns={[
              { header: 'الاسم', render: (t) => t.name },
              { header: 'المعرّف (Slug)', render: (t) => t.slug },
              { header: 'الفروع', render: (t) => t._count.branches },
              { header: 'المستخدمون', render: (t) => t._count.users },
              {
                header: 'الحالة',
                render: (t) => (
                  <span className={t.status === 'ACTIVE' ? 'text-emerald-600' : 'text-red-500'}>
                    {t.status === 'ACTIVE' ? 'نشط' : 'موقوف'}
                  </span>
                ),
              },
              {
                header: '',
                render: (t) => (
                  <button onClick={() => toggleStatus(t)} className="text-sm text-brand-600 hover:underline">
                    {t.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                  </button>
                ),
              },
            ]}
          />
        </section>

        <section>
          <PageHeader title="الخطط (Plans)" action={<PrimaryButton onClick={() => setCreatePlanOpen(true)}>+ خطة جديدة</PrimaryButton>} />
          <div className="grid grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-bold">{plan.name}</h3>
                  <span className="font-bold text-brand-600">{(plan.priceCents / 100).toFixed(2)} ج.م</span>
                </div>
                <p className="text-xs text-slate-500">
                  حتى {plan.maxBranches} فرع · {plan.maxUsers} مستخدم · {plan.durationDays} يوم
                </p>
                {plan.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {plan.features.map((f) => (
                      <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {plans.length === 0 && <p className="text-sm text-slate-400">لا توجد خطط بعد</p>}
          </div>
        </section>

        <section>
          <PageHeader title="الاشتراكات (Subscriptions)" action={<PrimaryButton onClick={() => setCreateSubscriptionOpen(true)}>+ ربط اشتراك بمتجر</PrimaryButton>} />
          <DataTable
            rows={subscriptions}
            columns={[
              { header: 'المتجر', render: (s) => s.tenant.name },
              { header: 'الخطة', render: (s) => s.plan.name },
              {
                header: 'الحالة',
                render: (s) => <span className={SUBSCRIPTION_STATUS_LABELS[s.status].tone}>{SUBSCRIPTION_STATUS_LABELS[s.status].label}</span>,
              },
              { header: 'البداية', render: (s) => new Date(s.startDate).toLocaleDateString('ar-EG') },
              { header: 'النهاية', render: (s) => new Date(s.endDate).toLocaleDateString('ar-EG') },
              {
                header: '',
                render: (s) =>
                  (s.status === 'ACTIVE' || s.status === 'TRIAL') && (
                    <button onClick={() => suspendSubscription(s.id)} className="text-sm text-red-600 hover:underline">
                      إيقاف
                    </button>
                  ),
              },
            ]}
          />
        </section>
      </main>

      <CreateTenantModal open={createTenantOpen} onClose={() => setCreateTenantOpen(false)} plans={plans} onDone={load} />
      <CreatePlanModal open={createPlanOpen} onClose={() => setCreatePlanOpen(false)} onDone={load} />
      <CreateSubscriptionModal open={createSubscriptionOpen} onClose={() => setCreateSubscriptionOpen(false)} tenants={tenants} plans={plans} onDone={load} />
    </div>
  );
}

function StatCard({ label, value, tone = 'text-slate-800' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function CreateTenantModal({ open, onClose, plans, onDone }: { open: boolean; onClose: () => void; plans: Plan[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [planId, setPlanId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/platform/tenants', {
        name,
        slug,
        ownerName,
        ownerEmail,
        ownerPassword,
        planId: planId || undefined,
      });
      onDone();
      onClose();
      setName('');
      setSlug('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      setPlanId('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="متجر (Tenant) جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم المتجر</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">المعرّف (slug — أحرف إنجليزية وأرقام وشرطات فقط)</label>
          <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="hussein-shoes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">اسم المالك</label>
          <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">بريد المالك الإلكتروني</label>
          <input required type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">كلمة مرور المالك</label>
          <input required type="password" minLength={8} value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الخطة (اختياري — تنشئ اشتراكًا تجريبيًا تلقائيًا)</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">بدون خطة الآن</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الإنشاء...' : 'إنشاء المتجر'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function CreatePlanModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [maxBranches, setMaxBranches] = useState('1');
  const [maxUsers, setMaxUsers] = useState('5');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('0');
  const [featuresInput, setFeaturesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/platform/plans', {
        name,
        maxBranches: Number(maxBranches),
        maxUsers: Number(maxUsers),
        durationDays: Number(durationDays),
        priceCents: Math.round(Number(price) * 100),
        features: featuresInput
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
      });
      onDone();
      onClose();
      setName('');
      setMaxBranches('1');
      setMaxUsers('5');
      setDurationDays('30');
      setPrice('0');
      setFeaturesInput('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="خطة جديدة">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم الخطة</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Growth" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">أقصى عدد فروع</label>
            <input required type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">أقصى عدد مستخدمين</label>
            <input required type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">مدة الاشتراك (أيام)</label>
            <input required type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">السعر (ج.م)</label>
            <input required type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">المميزات (مفصولة بفاصلة، اختياري)</label>
          <input value={featuresInput} onChange={(e) => setFeaturesInput(e.target.value)} placeholder="pos, inventory, reports" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'إنشاء الخطة'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function CreateSubscriptionModal({
  open,
  onClose,
  tenants,
  plans,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenants: Tenant[];
  plans: Plan[];
  onDone: () => void;
}) {
  const [tenantId, setTenantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !planId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/platform/subscriptions', { tenantId, planId });
      onDone();
      onClose();
      setTenantId('');
      setPlanId('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ربط اشتراك بمتجر">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">المتجر</label>
          <select required value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="" disabled>
              اختر متجرًا
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الخطة</label>
          <select required value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="" disabled>
              اختر خطة
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-400">يبدأ الاشتراك فورًا بحالة "نشط" وينتهي تلقائيًا بعد عدد الأيام المحددة في الخطة.</p>
        <PrimaryButton type="submit" disabled={submitting || !tenantId || !planId} className="w-full">
          {submitting ? 'جارِ الربط...' : 'ربط الاشتراك'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
