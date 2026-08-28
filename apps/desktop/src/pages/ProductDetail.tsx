import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { QuickSelectCreate, type QuickOption } from '../components/QuickSelectCreate';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { formatCurrency } from '../utils/currency';

interface VariantRow {
  id: string;
  sku: string;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  isActive: boolean;
  size: { label: string };
  color: { name: string };
}

interface ProductDetail {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  costPrice: string;
  sellingPrice: string;
  isActive: boolean;
  brandId: string | null;
  categoryId: string | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  variants: VariantRow[];
}

interface StockEntry {
  branchId: string;
  branchName: string;
  quantity: number;
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [stockByVariant, setStockByVariant] = useState<Record<string, StockEntry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyVariant, setHistoryVariant] = useState<{ id: string; label: string } | null>(null);
  const canUpdate = useAuthStore((s) => s.hasPermission(PERMISSIONS.PRODUCT_UPDATE));

  async function load() {
    if (!productId) return;
    try {
      const res = await apiClient.get(`/api/products/${productId}`);
      const p: ProductDetail = res.data.data;
      setProduct(p);

      // Fetch per-branch stock for each variant in parallel.
      const entries = await Promise.all(
        p.variants.map(async (v) => {
          const stockRes = await apiClient.get(`/api/inventory/variant/${v.id}`);
          const levels = stockRes.data.data.levels as { quantity: number; branch: { id: string; name: string } }[];
          return [v.id, levels.map((l) => ({ branchId: l.branch.id, branchName: l.branch.name, quantity: l.quantity }))] as const;
        }),
      );
      setStockByVariant(Object.fromEntries(entries));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!product) return <p className="text-slate-400">جارِ التحميل...</p>;

  return (
    <div>
      <button onClick={() => navigate('/products')} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight size={16} /> رجوع للمنتجات
      </button>

      <PageHeader
        title={product.name}
        action={
          canUpdate && (
            <div className="flex gap-2">
              <button onClick={() => setEditOpen(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                تعديل المنتج
              </button>
              <PrimaryButton onClick={() => setAddVariantOpen(true)}>+ إضافة مقاس / لون</PrimaryButton>
            </div>
          )
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <InfoCard label="SKU الأساسي" value={product.sku} />
        <InfoCard label="الماركة" value={product.brand?.name ?? '—'} />
        <InfoCard label="سعر التكلفة" value={formatCurrency(Number(product.costPrice))} />
        <InfoCard label="سعر البيع" value={formatCurrency(Number(product.sellingPrice))} />
      </div>

      <h2 className="mb-3 font-bold">المتغيرات (المقاسات والألوان)</h2>

      {product.variants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          لا توجد متغيرات لهذا المنتج بعد. أضف مقاسًا ولونًا حتى يمكن بيعه أو إضافة مخزون له.
        </div>
      ) : (
        <div className="space-y-3">
          {product.variants.map((v) => {
            const stock = stockByVariant[v.id] ?? [];
            const total = stock.reduce((sum, s) => sum + s.quantity, 0);
            return (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">
                      مقاس {v.size.label} · {v.color.name}
                    </span>
                    <span className="mr-2 text-xs text-slate-400">SKU: {v.sku}</span>
                    {v.barcode && <span className="mr-2 text-xs text-slate-400">باركود: {v.barcode}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${total > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      إجمالي المخزون: {total}
                    </span>
                    <button onClick={() => setHistoryVariant({ id: v.id, label: `${v.size.label} · ${v.color.name}` })} className="text-xs text-brand-600 hover:underline">
                      سجل الحركة
                    </button>
                  </div>
                </div>
                {stock.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {stock.map((s) => (
                      <span key={s.branchId} className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {s.branchName}: {s.quantity}
                      </span>
                    ))}
                  </div>
                )}
                {stock.length === 0 && (
                  <p className="text-xs text-slate-400">
                    لا يوجد مخزون بعد لهذا المتغير في أي فرع.{' '}
                    <Link to="/purchases" className="text-brand-600 hover:underline">
                      أضِف عبر المشتريات
                    </Link>{' '}
                    أو{' '}
                    <Link to="/inventory" className="text-brand-600 hover:underline">
                      تسوية مخزون
                    </Link>
                    .
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddVariantPanel open={addVariantOpen} onClose={() => setAddVariantOpen(false)} product={product} onDone={load} />
      {editOpen && <EditProductModal product={product} onClose={() => setEditOpen(false)} onDone={load} />}
      {historyVariant && (
        <StockMovementHistoryModal variantId={historyVariant.id} variantLabel={historyVariant.label} onClose={() => setHistoryVariant(null)} />
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function AddVariantPanel({
  open,
  onClose,
  product,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductDetail;
  onDone: () => void;
}) {
  const [sizes, setSizes] = useState<QuickOption[]>([]);
  const [colors, setColors] = useState<QuickOption[]>([]);
  const [sizeId, setSizeId] = useState('');
  const [colorId, setColorId] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [costPrice, setCostPrice] = useState(product.costPrice);
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sizeId || !colorId) return;
    setSubmitting(true);
    setError(null);
    try {
      const sizeLabel = sizes.find((s) => s.id === sizeId)?.label ?? '';
      const colorName = colors.find((c) => c.id === colorId)?.label ?? '';
      const autoSku = sku.trim() || `${product.sku}-${sizeLabel}-${colorName}`.toUpperCase().replace(/\s+/g, '-');
      await apiClient.post(`/api/products/${product.id}/variants`, {
        sizeId,
        colorId,
        sku: autoSku,
        barcode: barcode || undefined,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        initialStock: 0,
      });
      onDone();
      onClose();
      setSizeId('');
      setColorId('');
      setSku('');
      setBarcode('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">إضافة مقاس / لون جديد</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <QuickSelectCreate label="المقاس" options={sizes} value={sizeId} onChange={setSizeId} onCreate={createSize} placeholder="اختر مقاس" required />
            <QuickSelectCreate label="اللون" options={colors} value={colorId} onChange={setColorId} onCreate={createColor} placeholder="اختر لون" required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">SKU (اختياري — يُولَّد تلقائيًا)</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الباركود (اختياري)</label>
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">سعر التكلفة</label>
              <input required type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">سعر البيع</label>
              <input required type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <PrimaryButton type="submit" disabled={submitting || !sizeId || !colorId} className="w-full">
            {submitting ? 'جارِ الحفظ...' : 'إضافة المتغير'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

interface MovementEntry {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
  branch: { name: string };
  user: { fullName: string } | null;
}

const MOVEMENT_LABELS: Record<string, { label: string; tone: string; sign: string }> = {
  PURCHASE_IN: { label: 'شراء', tone: 'text-emerald-600', sign: '+' },
  SALE_OUT: { label: 'بيع', tone: 'text-red-600', sign: '-' },
  RETURN_IN: { label: 'مرتجع', tone: 'text-emerald-600', sign: '+' },
  ADJUSTMENT_IN: { label: 'تسوية (زيادة)', tone: 'text-emerald-600', sign: '+' },
  ADJUSTMENT_OUT: { label: 'تسوية (نقصان)', tone: 'text-red-600', sign: '-' },
  TRANSFER_IN: { label: 'نقل وارد', tone: 'text-brand-600', sign: '+' },
  TRANSFER_OUT: { label: 'نقل صادر', tone: 'text-brand-600', sign: '-' },
};

/**
 * Reads directly from the StockMovement append-only ledger
 * (GET /api/inventory/movements) — this is what finally makes that ledger
 * actually viewable, closing a gap where every stock-affecting operation
 * in the system was faithfully recorded but permanently invisible.
 */
function StockMovementHistoryModal({ variantId, variantLabel, onClose }: { variantId: string; variantLabel: string; onClose: () => void }) {
  const [entries, setEntries] = useState<MovementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/inventory/movements', { params: { variantId, pageSize: 50 } })
      .then((res) => setEntries(res.data.data.items))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [variantId]);

  return (
    <Modal open onClose={onClose} title={`سجل حركة المخزون — ${variantLabel}`}>
      {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {loading ? (
        <p className="text-sm text-slate-400">جارِ التحميل...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد حركات مسجّلة لهذا المتغير بعد</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {entries.map((entry) => {
            const meta = MOVEMENT_LABELS[entry.type] ?? { label: entry.type, tone: 'text-slate-600', sign: '' };
            return (
              <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <div>
                  <span className={`font-bold ${meta.tone}`}>
                    {meta.label} ({meta.sign}
                    {entry.quantity})
                  </span>
                  <span className="mr-2 text-slate-500">{entry.branch.name}</span>
                  {entry.reason && <div className="mt-0.5 text-slate-400">{entry.reason}</div>}
                </div>
                <div className="text-left text-slate-400">
                  <div>{entry.user?.fullName ?? 'النظام'}</div>
                  <div>{new Date(entry.createdAt).toLocaleString('ar-EG')}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function EditProductModal({ product, onClose, onDone }: { product: ProductDetail; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [costPrice, setCostPrice] = useState(product.costPrice);
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice);
  const [isActive, setIsActive] = useState(product.isActive);
  const [brandId, setBrandId] = useState(product.brandId ?? '');
  const [categoryId, setCategoryId] = useState(product.categoryId ?? '');
  const [brands, setBrands] = useState<QuickOption[]>([]);
  const [categories, setCategories] = useState<QuickOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/api/products/meta/brands').then((res) => setBrands(res.data.data.map((b: any) => ({ id: b.id, label: b.name }))));
    apiClient.get('/api/products/meta/categories').then((res) => setCategories(res.data.data.map((c: any) => ({ id: c.id, label: c.name }))));
  }, []);

  async function createBrand(label: string) {
    const res = await apiClient.post('/api/products/meta/brands', { name: label });
    const created = { id: res.data.data.id, label: res.data.data.name };
    setBrands((prev) => [...prev, created]);
    return created;
  }

  async function createCategory(label: string) {
    const res = await apiClient.post('/api/products/meta/categories', { name: label });
    const created = { id: res.data.data.id, label: res.data.data.name };
    setCategories((prev) => [...prev, created]);
    return created;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/products/${product.id}`, {
        name,
        description: description || undefined,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        isActive,
        brandId: brandId || null,
        categoryId: categoryId || null,
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
    <Modal open onClose={onClose} title={`تعديل — ${product.name}`}>
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto pl-1">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم المنتج</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <QuickSelectCreate label="الماركة" options={brands} value={brandId} onChange={setBrandId} onCreate={createBrand} placeholder="بدون ماركة" />
          <QuickSelectCreate label="الفئة" options={categories} value={categoryId} onChange={setCategoryId} onCreate={createCategory} placeholder="بدون فئة" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الوصف</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">سعر التكلفة</label>
            <input required type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">سعر البيع</label>
            <input required type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          المنتج نشط (يظهر في نقطة البيع والبحث)
        </label>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ التعديلات'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
