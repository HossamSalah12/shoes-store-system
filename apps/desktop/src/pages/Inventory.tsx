import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { AsyncPicker, type PickerOption } from '../components/AsyncPicker';
import { fetchVariantOptions } from '../api/pickers';
import { useRealtimeStore } from '../state/realtimeStore';

interface Branch {
  id: string;
  name: string;
}

interface StockRow {
  id: string;
  quantity: number;
  variant: { id: string; sku: string; product: { name: string }; size: { label: string }; color: { name: string } };
}

export function InventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const canAdjust = useAuthStore((s) => s.hasPermission(PERMISSIONS.INVENTORY_ADJUST));
  const canTransfer = useAuthStore((s) => s.hasPermission(PERMISSIONS.INVENTORY_TRANSFER));
  const stockVersion = useRealtimeStore((s) => s.stockVersion);

  async function load() {
    if (!activeBranchId) return;
    try {
      const endpoint = showLowStockOnly ? '/api/inventory/low-stock' : `/api/inventory/branch/${activeBranchId}`;
      const params = showLowStockOnly ? { branchId: activeBranchId, threshold: 5 } : undefined;
      const [stockRes, branchesRes] = await Promise.all([apiClient.get(endpoint, { params }), apiClient.get('/api/branches')]);
      setRows(stockRes.data.data);
      const allBranches: Branch[] = branchesRes.data.data;
      const isOwner = user?.roles.includes('OWNER');
      setBranches(isOwner ? allBranches : allBranches.filter((b) => user?.branchIds.includes(b.id)));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, showLowStockOnly, stockVersion]);

  return (
    <div>
      <PageHeader
        title="المخزون"
        action={
          <div className="flex gap-2">
            {canTransfer && (
              <button onClick={() => setTransferOpen(true)} className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                نقل بين الفروع
              </button>
            )}
            {canAdjust && <PrimaryButton onClick={() => setAdjustOpen(true)}>تسوية مخزون</PrimaryButton>}
          </div>
        }
      />

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showLowStockOnly} onChange={(e) => setShowLowStockOnly(e.target.checked)} />
        عرض الأصناف منخفضة المخزون فقط
      </label>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {!activeBranchId ? (
        <p className="text-slate-400">يرجى اختيار فرع من الأعلى</p>
      ) : (
        <DataTable
          rows={rows}
          columns={[
            { header: 'المنتج', render: (r) => r.variant.product.name },
            { header: 'المقاس', render: (r) => r.variant.size.label },
            { header: 'اللون', render: (r) => r.variant.color.name },
            { header: 'SKU', render: (r) => r.variant.sku },
            {
              header: 'الكمية المتاحة',
              render: (r) => (
                <span className={r.quantity <= 5 ? 'font-bold text-amber-600' : 'font-semibold'}>{r.quantity}</span>
              ),
            },
          ]}
        />
      )}

      <AdjustStockModal open={adjustOpen} onClose={() => setAdjustOpen(false)} branchId={activeBranchId} onDone={load} />
      <TransferStockModal open={transferOpen} onClose={() => setTransferOpen(false)} branches={branches} defaultFromBranchId={activeBranchId} onDone={load} />
    </div>
  );
}

function TransferStockModal({
  open,
  onClose,
  branches,
  defaultFromBranchId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  defaultFromBranchId: string | null;
  onDone: () => void;
}) {
  const [variant, setVariant] = useState<PickerOption | null>(null);
  const [fromBranchId, setFromBranchId] = useState(defaultFromBranchId ?? '');
  const [toBranchId, setToBranchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) setFromBranchId(defaultFromBranchId ?? '');
  }, [open, defaultFromBranchId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !fromBranchId || !toBranchId) return;
    if (fromBranchId === toBranchId) {
      setError('يجب أن يكون فرع المصدر مختلفًا عن فرع الوجهة');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.post('/api/inventory/transfer', {
        variantId: variant.id,
        fromBranchId,
        toBranchId,
        quantity: Number(quantity),
        notes: notes || undefined,
      });
      setSuccess('تم نقل المخزون بنجاح');
      onDone();
      setVariant(null);
      setQuantity('1');
      setNotes('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSuccess(null);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="نقل مخزون بين الفروع">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{success}</div>}

        <AsyncPicker label="المنتج" value={variant} onChange={setVariant} fetchOptions={fetchVariantOptions} required placeholder="ابحث بالاسم أو SKU" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">من فرع</label>
            <select required value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="" disabled>
                اختر الفرع
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">إلى فرع</label>
            <select required value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="" disabled>
                اختر الفرع
              </option>
              {branches
                .filter((b) => b.id !== fromBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">الكمية</label>
          <input required type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ملاحظات (اختياري)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <PrimaryButton type="submit" disabled={submitting || !variant || !fromBranchId || !toBranchId} className="w-full">
          {submitting ? 'جارِ النقل...' : 'تأكيد النقل'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function AdjustStockModal({ open, onClose, branchId, onDone }: { open: boolean; onClose: () => void; branchId: string | null; onDone: () => void }) {
  const [variant, setVariant] = useState<PickerOption | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId || !variant) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/inventory/adjust', {
        variantId: variant.id,
        branchId,
        quantityDelta: Number(delta),
        reason,
      });
      onDone();
      onClose();
      setVariant(null);
      setDelta('');
      setReason('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="تسوية مخزون">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <AsyncPicker label="المنتج" value={variant} onChange={setVariant} fetchOptions={fetchVariantOptions} required placeholder="ابحث بالاسم أو SKU" />

        <div>
          <label className="mb-1 block text-sm font-medium">مقدار التغيير (+ للزيادة، - للنقصان)</label>
          <input required type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">السبب</label>
          <input required value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting || !variant} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'تأكيد التسوية'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
