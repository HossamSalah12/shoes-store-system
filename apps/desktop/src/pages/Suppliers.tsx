import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { formatCurrency } from '../utils/currency';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  balance: string;
}

interface SupplierPayment {
  id: string;
  amount: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.SUPPLIER_MANAGE));

  async function load() {
    try {
      const res = await apiClient.get('/api/suppliers');
      setSuppliers(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader title="الموردون" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ مورد جديد</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={suppliers}
        columns={[
          { header: 'الاسم', render: (s) => s.name },
          { header: 'الهاتف', render: (s) => s.phone ?? '—' },
          { header: 'البريد الإلكتروني', render: (s) => s.email ?? '—' },
          {
            header: 'الرصيد المستحق',
            render: (s) => (
              <span className={Number(s.balance) > 0 ? 'font-bold text-amber-600' : 'text-slate-500'}>
                {formatCurrency(Number(s.balance))}
              </span>
            ),
          },
          {
            header: '',
            render: (s) => (
              <div className="flex gap-3 text-sm">
                {canManage && (
                  <button onClick={() => setEditingSupplier(s)} className="text-brand-600 hover:underline">
                    تعديل
                  </button>
                )}
                {canManage && Number(s.balance) > 0 && (
                  <button onClick={() => setPaymentSupplier(s)} className="text-brand-600 hover:underline">
                    تسجيل دفعة
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      <CreateSupplierModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
      {editingSupplier && (
        <EditSupplierModal supplier={editingSupplier} onClose={() => setEditingSupplier(null)} onDone={load} />
      )}
      {paymentSupplier && (
        <SupplierPaymentModal supplier={paymentSupplier} onClose={() => setPaymentSupplier(null)} onDone={load} />
      )}
    </div>
  );
}

function CreateSupplierModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/suppliers', { name, phone: phone || undefined, email: email || undefined });
      onDone();
      onClose();
      setName('');
      setPhone('');
      setEmail('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="مورد جديد">
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
          <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ المورد'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditSupplierModal({ supplier, onClose, onDone }: { supplier: Supplier; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone ?? '');
  const [email, setEmail] = useState(supplier.email ?? '');
  const [address, setAddress] = useState(supplier.address ?? '');
  const [notes, setNotes] = useState(supplier.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/suppliers/${supplier.id}`, {
        name,
        phone: phone || undefined,
        email: email || undefined,
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
    <Modal open onClose={onClose} title={`تعديل — ${supplier.name}`}>
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
          <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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

function SupplierPaymentModal({ supplier, onClose, onDone }: { supplier: Supplier; onClose: () => void; onDone: () => void }) {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBalance, setCurrentBalance] = useState(Number(supplier.balance));

  async function loadPayments() {
    try {
      const res = await apiClient.get(`/api/suppliers/${supplier.id}/payments`);
      setPayments(res.data.data);
    } catch {
      /* non-fatal — history is a bonus, not required for recording a payment */
    }
  }

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/api/suppliers/${supplier.id}/payments`, {
        amount: Number(amount),
        method: method || undefined,
        notes: notes || undefined,
      });
      setCurrentBalance((b) => b - Number(amount));
      setAmount('');
      setMethod('');
      setNotes('');
      loadPayments();
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`تسجيل دفعة — ${supplier.name}`}>
      <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        الرصيد المستحق حاليًا: <span className="font-bold">{formatCurrency(currentBalance)}</span>
      </div>

      <form onSubmit={handleSubmit} className="mb-4 space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">المبلغ المدفوع</label>
          <input required type="number" min={0.01} step="0.01" max={currentBalance} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">طريقة الدفع (اختياري)</label>
          <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="نقدًا، تحويل بنكي..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ملاحظات (اختياري)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting || currentBalance <= 0} className="w-full">
          {submitting ? 'جارِ التسجيل...' : 'تسجيل الدفعة'}
        </PrimaryButton>
      </form>

      {payments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">سجل الدفعات السابقة</h3>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span>
                  {formatCurrency(Number(p.amount))} {p.method && `· ${p.method}`}
                </span>
                <span className="text-slate-400">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
