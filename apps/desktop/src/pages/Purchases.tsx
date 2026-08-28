import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { AsyncPicker, type PickerOption } from '../components/AsyncPicker';
import { fetchSupplierOptions, fetchVariantOptions } from '../api/pickers';
import { formatCurrency } from '../utils/currency';

interface Purchase {
  id: string;
  totalCost: string;
  status: string;
  createdAt: string;
  supplier: { name: string };
  branch: { name: string };
}

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  async function load() {
    try {
      const res = await apiClient.get('/api/purchases', { params: { branchId: activeBranchId ?? undefined, pageSize: 50 } });
      setPurchases(res.data.data.items);
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
      <PageHeader title="المشتريات" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ عملية شراء</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={purchases}
        columns={[
          { header: 'المورد', render: (p) => p.supplier.name },
          { header: 'الفرع', render: (p) => p.branch.name },
          { header: 'التكلفة الإجمالية', render: (p) => formatCurrency(Number(p.totalCost)) },
          { header: 'الحالة', render: (p) => p.status },
          { header: 'التاريخ', render: (p) => new Date(p.createdAt).toLocaleString('ar-EG') },
        ]}
      />
      <CreatePurchaseModal open={createOpen} onClose={() => setCreateOpen(false)} branchId={activeBranchId} onDone={load} />
    </div>
  );
}

interface PurchaseLine {
  variant: PickerOption;
  quantity: number;
  unitCost: number;
}

function CreatePurchaseModal({ open, onClose, branchId, onDone }: { open: boolean; onClose: () => void; branchId: string | null; onDone: () => void }) {
  const [supplier, setSupplier] = useState<PickerOption | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [pendingVariant, setPendingVariant] = useState<PickerOption | null>(null);
  const [pendingQty, setPendingQty] = useState('1');
  const [pendingCost, setPendingCost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    if (!pendingVariant || !pendingQty || !pendingCost) return;
    setLines((prev) => [...prev, { variant: pendingVariant, quantity: Number(pendingQty), unitCost: Number(pendingCost) }]);
    setPendingVariant(null);
    setPendingQty('1');
    setPendingCost('');
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variant.id !== variantId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId || !supplier || lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/purchases', {
        branchId,
        supplierId: supplier.id,
        items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitCost: l.unitCost })),
      });
      onDone();
      onClose();
      setSupplier(null);
      setLines([]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="عملية شراء جديدة">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <AsyncPicker label="المورد" value={supplier} onChange={setSupplier} fetchOptions={fetchSupplierOptions} required placeholder="ابحث عن مورد" />

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium">إضافة صنف</div>
          <AsyncPicker label="المنتج" value={pendingVariant} onChange={setPendingVariant} fetchOptions={fetchVariantOptions} placeholder="ابحث بالاسم أو SKU" />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">الكمية</label>
              <input type="number" min={1} value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">تكلفة الوحدة</label>
              <input type="number" min={0} step="0.01" value={pendingCost} onChange={(e) => setPendingCost(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="button" onClick={addLine} disabled={!pendingVariant || !pendingQty || !pendingCost} className="mt-2 w-full rounded-lg border border-brand-300 py-1.5 text-sm text-brand-700 disabled:opacity-40">
            + إضافة للقائمة
          </button>
        </div>

        {lines.length > 0 && (
          <div className="space-y-1">
            {lines.map((l) => (
              <div key={l.variant.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>
                  {l.variant.label} × {l.quantity} @ {formatCurrency(l.unitCost)}
                </span>
                <button type="button" onClick={() => removeLine(l.variant.id)} className="text-red-500 hover:text-red-700">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <PrimaryButton type="submit" disabled={submitting || !supplier || lines.length === 0} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'تسجيل الشراء'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
