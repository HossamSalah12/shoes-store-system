import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { Modal, PrimaryButton } from './DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';

interface Option {
  id: string;
  name?: string;
  label?: string;
}

interface Variant {
  id: string;
  sku: string;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  isActive: boolean;
  size: { id: string; label: string };
  color: { id: string; name: string };
}

interface Branch {
  id: string;
  name: string;
}

const NEW_OPTION = '__new__';

/**
 * Lets a user (with product.update permission) add sizes/colors/variants to
 * an existing product, and optionally seed opening stock for a branch.
 *
 * The backend intentionally does NOT auto-create stock when a variant is
 * added (stock is always branch-specific) — see product.service.ts's
 * `addVariant`. So after creating the variant we follow up with an explicit
 * POST /api/inventory/adjust when the user filled in an opening quantity.
 */
export function ProductVariantsModal({
  productId,
  onClose,
  onChanged,
}: {
  productId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [productName, setProductName] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [sizes, setSizes] = useState<Option[]>([]);
  const [colors, setColors] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdjustStock = useAuthStore((s) => s.hasPermission(PERMISSIONS.INVENTORY_ADJUST));
  // Creating a brand-new size/color label hits the same `product.create`
  // permission as creating a product (see product.routes.ts's meta
  // endpoints) — separate from `product.update`, which only lets you add
  // variants using sizes/colors that already exist.
  const canCreateMeta = useAuthStore((s) => s.hasPermission(PERMISSIONS.PRODUCT_CREATE));

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [productRes, sizesRes, colorsRes, branchesRes] = await Promise.all([
          apiClient.get(`/api/products/${productId}`),
          apiClient.get('/api/products/meta/sizes'),
          apiClient.get('/api/products/meta/colors'),
          apiClient.get('/api/branches'),
        ]);
        if (cancelled) return;
        setProductName(productRes.data.data.name);
        setVariants(productRes.data.data.variants);
        setSizes(sizesRes.data.data);
        setColors(colorsRes.data.data);
        setBranches(branchesRes.data.data);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!productId) return null;

  async function refreshVariants() {
    const res = await apiClient.get(`/api/products/${productId}`);
    setVariants(res.data.data.variants);
  }

  return (
    <Modal open onClose={onClose} title={`متغيرات المنتج: ${productName}`}>
      {error && <div className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {loading ? (
        <p className="text-sm text-slate-400">جارِ التحميل...</p>
      ) : (
        <div className="space-y-4">
          {variants.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
              لا توجد متغيرات بعد — المنتج لن يظهر في نقطة البيع حتى تضيف مقاس/لون واحد على الأقل.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-right">المقاس</th>
                    <th className="p-2 text-right">اللون</th>
                    <th className="p-2 text-right">SKU</th>
                    <th className="p-2 text-right">السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-t border-slate-100">
                      <td className="p-2">{v.size.label}</td>
                      <td className="p-2">{v.color.name}</td>
                      <td className="p-2">{v.sku}</td>
                      <td className="p-2">{Number(v.sellingPrice).toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AddVariantForm
            productId={productId}
            sizes={sizes}
            colors={colors}
            branches={branches}
            canAdjustStock={canAdjustStock}
            canCreateMeta={canCreateMeta}
            onSizeCreated={(s) => setSizes((prev) => [...prev, s])}
            onColorCreated={(c) => setColors((prev) => [...prev, c])}
            onAdded={() => {
              void refreshVariants();
              onChanged();
            }}
          />
        </div>
      )}
    </Modal>
  );
}

function AddVariantForm({
  productId,
  sizes,
  colors,
  branches,
  canAdjustStock,
  canCreateMeta,
  onSizeCreated,
  onColorCreated,
  onAdded,
}: {
  productId: string;
  sizes: Option[];
  colors: Option[];
  branches: Branch[];
  canAdjustStock: boolean;
  canCreateMeta: boolean;
  onSizeCreated: (s: Option) => void;
  onColorCreated: (c: Option) => void;
  onAdded: () => void;
}) {
  const [sizeId, setSizeId] = useState('');
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [colorId, setColorId] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [branchId, setBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let resolvedSizeId = sizeId;
      if (sizeId === NEW_OPTION) {
        const res = await apiClient.post('/api/products/meta/sizes', { name: newSizeLabel });
        resolvedSizeId = res.data.data.id;
        onSizeCreated({ id: resolvedSizeId, label: newSizeLabel, name: newSizeLabel });
      }

      let resolvedColorId = colorId;
      if (colorId === NEW_OPTION) {
        const res = await apiClient.post('/api/products/meta/colors', { name: newColorName });
        resolvedColorId = res.data.data.id;
        onColorCreated({ id: resolvedColorId, name: newColorName });
      }

      if (!resolvedSizeId || !resolvedColorId) {
        setError('اختر أو أضف مقاسًا ولونًا');
        setSubmitting(false);
        return;
      }

      const variantRes = await apiClient.post(`/api/products/${productId}/variants`, {
        sizeId: resolvedSizeId,
        colorId: resolvedColorId,
        sku,
        barcode: barcode || undefined,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
      });

      const qty = Number(initialStock);
      if (canAdjustStock && branchId && qty > 0) {
        await apiClient.post('/api/inventory/adjust', {
          variantId: variantRes.data.data.id,
          branchId,
          quantityDelta: qty,
          reason: 'رصيد افتتاحي عند إضافة المتغيّر',
        });
      }

      setSizeId('');
      setNewSizeLabel('');
      setColorId('');
      setNewColorName('');
      setSku('');
      setBarcode('');
      setCostPrice('');
      setSellingPrice('');
      setInitialStock('');
      setBranchId('');
      onAdded();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-700">إضافة متغيّر جديد</h3>
      {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">المقاس</label>
          <select required value={sizeId} onChange={(e) => setSizeId(e.target.value)} className={inputClass}>
            <option value="" disabled>
              اختر مقاسًا
            </option>
            {sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? s.name}
              </option>
            ))}
            {canCreateMeta && <option value={NEW_OPTION}>+ مقاس جديد</option>}
          </select>
          {sizeId === NEW_OPTION && (
            <input
              required
              value={newSizeLabel}
              onChange={(e) => setNewSizeLabel(e.target.value)}
              placeholder="مثال: 42"
              className={`mt-2 ${inputClass}`}
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">اللون</label>
          <select required value={colorId} onChange={(e) => setColorId(e.target.value)} className={inputClass}>
            <option value="" disabled>
              اختر لونًا
            </option>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {canCreateMeta && <option value={NEW_OPTION}>+ لون جديد</option>}
          </select>
          {colorId === NEW_OPTION && (
            <input
              required
              value={newColorName}
              onChange={(e) => setNewColorName(e.target.value)}
              placeholder="مثال: أسود"
              className={`mt-2 ${inputClass}`}
            />
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">SKU</label>
        <input required value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">الباركود (اختياري)</label>
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">سعر التكلفة</label>
          <input required type="number" min={0} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">سعر البيع</label>
          <input required type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className={inputClass} />
        </div>
      </div>

      {canAdjustStock && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-sm font-medium">الفرع (لرصيد افتتاحي)</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">بدون رصيد الآن</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الكمية الافتتاحية</label>
            <input type="number" min={0} value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      <PrimaryButton type="submit" disabled={submitting} className="w-full">
        {submitting ? 'جارِ الحفظ...' : 'إضافة المتغيّر'}
      </PrimaryButton>
    </form>
  );
}
