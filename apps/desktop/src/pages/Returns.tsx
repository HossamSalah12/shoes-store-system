import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { AsyncPicker, type PickerOption } from '../components/AsyncPicker';
import { fetchSaleOptions, fetchSaleItems } from '../api/pickers';
import { formatCurrency } from '../utils/currency';
import { useRealtimeStore } from '../state/realtimeStore';

interface ReturnRow {
  id: string;
  reason: string;
  totalAmount: string;
  createdAt: string;
  sale: { invoiceNumber: string };
}

export function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const returnVersion = useRealtimeStore((s) => s.returnVersion);

  async function load() {
    try {
      const res = await apiClient.get('/api/returns', { params: { branchId: activeBranchId ?? undefined } });
      setReturns(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, returnVersion]);

  return (
    <div>
      <PageHeader title="المرتجعات" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ مرتجع جديد</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={returns}
        columns={[
          { header: 'رقم الفاتورة الأصلية', render: (r) => r.sale.invoiceNumber },
          { header: 'السبب', render: (r) => r.reason },
          { header: 'قيمة المرتجع', render: (r) => formatCurrency(Number(r.totalAmount)) },
          { header: 'التاريخ', render: (r) => new Date(r.createdAt).toLocaleString('ar-EG') },
        ]}
      />
      <CreateReturnModal open={createOpen} onClose={() => setCreateOpen(false)} branchId={activeBranchId} onDone={load} />
    </div>
  );
}

function CreateReturnModal({ open, onClose, branchId, onDone }: { open: boolean; onClose: () => void; branchId: string | null; onDone: () => void }) {
  const [sale, setSale] = useState<PickerOption | null>(null);
  const [saleItemOptions, setSaleItemOptions] = useState<PickerOption[]>([]);
  const [saleItem, setSaleItem] = useState<PickerOption | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaleItem(null);
    if (sale) {
      fetchSaleItems(sale.id).then(setSaleItemOptions).catch(() => setSaleItemOptions([]));
    } else {
      setSaleItemOptions([]);
    }
  }, [sale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId || !sale || !saleItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/returns', {
        saleId: sale.id,
        branchId,
        items: [{ saleItemId: saleItem.id, quantity: Number(quantity) }],
        reason,
      });
      onDone();
      onClose();
      setSale(null);
      setSaleItem(null);
      setQuantity('1');
      setReason('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="مرتجع جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <AsyncPicker label="عملية البيع" value={sale} onChange={setSale} fetchOptions={fetchSaleOptions} required placeholder="ابحث برقم الفاتورة" />

        {sale && (
          <div>
            <label className="mb-1 block text-sm font-medium">الصنف المطلوب إرجاعه</label>
            {saleItemOptions.length === 0 ? (
              <p className="text-xs text-slate-400">جارِ تحميل أصناف هذه الفاتورة...</p>
            ) : (
              <select
                required
                value={saleItem?.id ?? ''}
                onChange={(e) => setSaleItem(saleItemOptions.find((o) => o.id === e.target.value) ?? null)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  اختر الصنف
                </option>
                {saleItemOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} ({o.sublabel})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">الكمية المرتجعة</label>
          <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">السبب</label>
          <input required value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting || !sale || !saleItem} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'تأكيد المرتجع'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
