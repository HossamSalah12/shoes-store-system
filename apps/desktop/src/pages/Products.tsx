import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { QuickSelectCreate, type QuickOption } from '../components/QuickSelectCreate';
import { formatCurrency } from '../utils/currency';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  costPrice: string;
  brand?: { name: string } | null;
  category?: { name: string } | null;
  variants: { id: string; sku: string; size: { label: string }; color: { name: string } }[];
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = useAuthStore((s) => s.hasPermission(PERMISSIONS.PRODUCT_CREATE));
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/products', { params: { search: search || undefined, pageSize: 50 } });
      setProducts(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <PageHeader
        title="المنتجات"
        action={canCreate && <PrimaryButton onClick={() => setCreateOpen(true)}>+ منتج جديد</PrimaryButton>}
      />

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو SKU أو الباركود"
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {loading ? (
        <p className="text-slate-400">جارِ التحميل...</p>
      ) : (
        <DataTable
          rows={products}
          onRowClick={(p) => navigate(`/products/${p.id}`)}
          columns={[
            { header: 'الاسم', render: (p) => <span className="font-medium">{p.name}</span> },
            { header: 'SKU', render: (p) => p.sku },
            { header: 'الماركة', render: (p) => p.brand?.name ?? '—' },
            { header: 'الفئة', render: (p) => p.category?.name ?? '—' },
            { header: 'سعر البيع', render: (p) => formatCurrency(Number(p.sellingPrice)) },
            { header: 'عدد المتغيرات', render: (p) => p.variants.length },
          ]}
        />
      )}

      <CreateProductModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

interface PendingVariant {
  key: string;
  sizeId: string;
  sizeLabel: string;
  colorId: string;
  colorName: string;
  sku: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
}

function CreateProductModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reference lists for building variants.
  const [sizes, setSizes] = useState<QuickOption[]>([]);
  const [colors, setColors] = useState<QuickOption[]>([]);
  const [pendingSizeId, setPendingSizeId] = useState('');
  const [pendingColorId, setPendingColorId] = useState('');
  const [pendingSku, setPendingSku] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [variants, setVariants] = useState<PendingVariant[]>([]);

  useEffect(() => {
    if (!open) return;
    apiClient.get('/api/products/meta/sizes').then((res) => setSizes(res.data.data.map((s: any) => ({ id: s.id, label: s.label }))));
    apiClient.get('/api/products/meta/colors').then((res) => setColors(res.data.data.map((c: any) => ({ id: c.id, label: c.name }))));
  }, [open]);

  async function createSize(label: string) {
    const res = await apiClient.post('/api/products/meta/sizes', { name: label });
    const created = { id: res.data.data.id, label: res.data.data.label };
    setSizes((prev) => [...prev, created]);
    return created;
  }

  async function createColor(label: string) {
    const res = await apiClient.post('/api/products/meta/colors', { name: label });
    const created = { id: res.data.data.id, label: res.data.data.name };
    setColors((prev) => [...prev, created]);
    return created;
  }

  function addVariant() {
    if (!pendingSizeId || !pendingColorId) return;
    const sizeLabel = sizes.find((s) => s.id === pendingSizeId)?.label ?? '';
    const colorName = colors.find((c) => c.id === pendingColorId)?.label ?? '';
    const alreadyAdded = variants.some((v) => v.sizeId === pendingSizeId && v.colorId === pendingColorId);
    if (alreadyAdded) {
      setError('هذا المقاس/اللون مضاف بالفعل');
      return;
    }
    setError(null);
    const autoSku = pendingSku.trim() || `${sku || 'SKU'}-${sizeLabel}-${colorName}`.toUpperCase().replace(/\s+/g, '-');
    setVariants((prev) => [
      ...prev,
      {
        key: `${pendingSizeId}-${pendingColorId}`,
        sizeId: pendingSizeId,
        sizeLabel,
        colorId: pendingColorId,
        colorName,
        sku: autoSku,
        barcode: pendingBarcode.trim(),
        costPrice: costPrice || '0',
        sellingPrice: sellingPrice || '0',
      },
    ]);
    setPendingSizeId('');
    setPendingColorId('');
    setPendingSku('');
    setPendingBarcode('');
  }

  function removeVariant(key: string) {
    setVariants((prev) => prev.filter((v) => v.key !== key));
  }

  function resetForm() {
    setName('');
    setSku('');
    setBarcode('');
    setCostPrice('');
    setSellingPrice('');
    setVariants([]);
    setPendingSizeId('');
    setPendingColorId('');
    setPendingSku('');
    setPendingBarcode('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/products', {
        name,
        sku,
        barcode: barcode || undefined,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        variants: variants.map((v) => ({
          sizeId: v.sizeId,
          colorId: v.colorId,
          sku: v.sku,
          barcode: v.barcode || undefined,
          costPrice: Number(v.costPrice),
          sellingPrice: Number(v.sellingPrice),
          initialStock: 0, // stock is always added afterward via Purchases or Inventory adjustment, per-branch
        })),
      });
      onCreated();
      onClose();
      resetForm();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="منتج جديد">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pl-1">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium">اسم المنتج</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">SKU الأساسي</label>
          <input required value={sku} onChange={(e) => setSku(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الباركود (اختياري)</label>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">سعر التكلفة الافتراضي</label>
            <input required type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">سعر البيع الافتراضي</label>
            <input required type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-bold">المقاسات والألوان (المتغيرات)</div>

          <div className="grid grid-cols-2 gap-3">
            <QuickSelectCreate label="المقاس" options={sizes} value={pendingSizeId} onChange={setPendingSizeId} onCreate={createSize} placeholder="اختر مقاس" />
            <QuickSelectCreate label="اللون" options={colors} value={pendingColorId} onChange={setPendingColorId} onCreate={createColor} placeholder="اختر لون" />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">SKU (اختياري — يُولَّد تلقائيًا)</label>
              <input value={pendingSku} onChange={(e) => setPendingSku(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">باركود هذا المتغير (اختياري)</label>
              <input value={pendingBarcode} onChange={(e) => setPendingBarcode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <button
            type="button"
            onClick={addVariant}
            disabled={!pendingSizeId || !pendingColorId}
            className="mt-2 w-full rounded-lg border border-brand-300 py-1.5 text-sm text-brand-700 disabled:opacity-40"
          >
            + إضافة هذا المتغير للقائمة
          </button>

          {variants.length > 0 && (
            <div className="mt-3 space-y-1">
              {variants.map((v) => (
                <div key={v.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    مقاس {v.sizeLabel} · {v.colorName} <span className="text-slate-400">({v.sku})</span>
                  </span>
                  <button type="button" onClick={() => removeVariant(v.key)} className="text-red-500 hover:text-red-700">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {variants.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              يمكنك حفظ المنتج بدون متغيرات وإضافتها لاحقًا، لكن سيتعذّر بيعه أو إضافة مخزون له من نقطة البيع حتى تُضاف مقاسات وألوان.
            </p>
          )}
        </div>

        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ المنتج'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
