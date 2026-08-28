import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { formatCurrency } from '../utils/currency';

interface Expense {
  id: string;
  category: string;
  amount: string;
  date: string;
  description: string | null;
  branch: { name: string };
}

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  async function load() {
    try {
      const res = await apiClient.get('/api/expenses', { params: { branchId: activeBranchId ?? undefined, pageSize: 50 } });
      setExpenses(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  return (
    <div>
      <PageHeader title="المصروفات" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ مصروف جديد</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={expenses}
        columns={[
          { header: 'الفئة', render: (e) => e.category },
          { header: 'الفرع', render: (e) => e.branch.name },
          { header: 'المبلغ', render: (e) => formatCurrency(Number(e.amount)) },
          { header: 'التاريخ', render: (e) => new Date(e.date).toLocaleDateString('ar-EG') },
          { header: 'الوصف', render: (e) => e.description ?? '—' },
        ]}
      />
      <CreateExpenseModal open={createOpen} onClose={() => setCreateOpen(false)} branchId={activeBranchId} onDone={load} />
    </div>
  );
}

function CreateExpenseModal({ open, onClose, branchId, onDone }: { open: boolean; onClose: () => void; branchId: string | null; onDone: () => void }) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/expenses', {
        branchId,
        category,
        amount: Number(amount),
        description: description || undefined,
      });
      onDone();
      onClose();
      setCategory('');
      setAmount('');
      setDescription('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="مصروف جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">الفئة</label>
          <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="إيجار، كهرباء، صيانة..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">المبلغ</label>
          <input required type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الوصف (اختياري)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ المصروف'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
