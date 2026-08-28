import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { formatCurrency } from '../utils/currency';

interface CustomerSale {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  createdAt: string;
}

interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  sales: CustomerSale[];
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
  REFUNDED: 'مرتجعة بالكامل',
  PARTIALLY_REFUNDED: 'مرتجعة جزئيًا',
};

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.CUSTOMER_MANAGE));

  function load() {
    if (!customerId) return;
    apiClient
      .get(`/api/customers/${customerId}`)
      .then((res) => setCustomer(res.data.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!customer) return <p className="text-slate-400">جارِ التحميل...</p>;

  // Computed from the (up to 20 most recent) sales the backend already
  // returns — this is real data derived from actual Sale rows, not a
  // display-only placeholder.
  const completedSales = customer.sales.filter((s) => s.status === 'COMPLETED' || s.status === 'PARTIALLY_REFUNDED');
  const totalSpent = completedSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);

  return (
    <div>
      <button onClick={() => navigate('/customers')} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight size={16} /> رجوع للعملاء
      </button>

      <PageHeader
        title={customer.name}
        action={canManage && <PrimaryButton onClick={() => setEditOpen(true)}>تعديل بيانات العميل</PrimaryButton>}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <InfoCard label="الهاتف" value={customer.phone ?? '—'} />
        <InfoCard label="العنوان" value={customer.address ?? '—'} />
        <InfoCard label="عدد المشتريات (آخر 20)" value={String(customer.sales.length)} />
        <InfoCard label="إجمالي الإنفاق (آخر 20)" value={formatCurrency(totalSpent)} />
      </div>

      {customer.notes && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <div className="mb-1 text-xs font-bold text-slate-400">ملاحظات</div>
          {customer.notes}
        </div>
      )}

      <h2 className="mb-3 font-bold">سجل المشتريات</h2>
      {customer.sales.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          لا توجد عمليات شراء مسجّلة لهذا العميل بعد
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 text-right font-medium">رقم الفاتورة</th>
                <th className="p-3 text-right font-medium">الإجمالي</th>
                <th className="p-3 text-right font-medium">الحالة</th>
                <th className="p-3 text-right font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {customer.sales.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{s.invoiceNumber}</td>
                  <td className="p-3 font-medium">{formatCurrency(Number(s.totalAmount))}</td>
                  <td className="p-3">{STATUS_LABELS[s.status] ?? s.status}</td>
                  <td className="p-3 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editOpen && <EditCustomerModal customer={customer} onClose={() => setEditOpen(false)} onDone={load} />}
    </div>
  );
}

function EditCustomerModal({ customer, onClose, onDone }: { customer: CustomerDetail; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/customers/${customer.id}`, {
        name,
        phone: phone || undefined,
        address: address || undefined,
        notes: notes || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`تعديل — ${customer.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">الاسم</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ التعديلات'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
