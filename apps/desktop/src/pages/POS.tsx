import { useState, useRef, useEffect } from 'react';
import { Search, Trash2, Plus, Minus, Printer } from 'lucide-react';
import { apiClient, extractErrorMessage, generateClientRequestId } from '../api/client';
import { useCartStore } from '../state/cartStore';
import { useAuthStore } from '../state/authStore';
import { useConnectionStore } from '../state/connectionStore';
import { PERMISSIONS } from '@shoes/shared';
import { AsyncPicker, type PickerOption } from '../components/AsyncPicker';
import { fetchCustomerOptions } from '../api/pickers';
import { Receipt, type ReceiptData } from '../components/Receipt';
import { formatCurrency } from '../utils/currency';

interface VariantSearchResult {
  id: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  product: { name: string };
  size: { label: string };
  color: { name: string };
}

export function POSPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [clientRequestId, setClientRequestId] = useState(generateClientRequestId());
  const [selectedCustomer, setSelectedCustomer] = useState<PickerOption | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cart = useCartStore();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const isSocketConnected = useConnectionStore((s) => s.isSocketConnected);
  const isOnline = useConnectionStore((s) => s.isOnline);
  const canDiscount = useAuthStore((s) => s.hasPermission(PERMISSIONS.SALE_DISCOUNT));

  useEffect(() => {
    searchInputRef.current?.focus();
    apiClient.get('/api/branches').then((res) => setBranches(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    cart.setCustomer(selectedCustomer?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  async function handleSearch(term: string) {
    setSearchTerm(term);
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Try exact barcode/SKU lookup first (fast path for a scanner gun),
      // fall back to fuzzy product search.
      try {
        const exact = await apiClient.get(`/api/products/lookup/${encodeURIComponent(term)}`);
        addVariantToCart(exact.data.data);
        setSearchTerm('');
        setSearchResults([]);
        setSearching(false);
        return;
      } catch {
        // not an exact match — fall through to fuzzy search
      }
      const response = await apiClient.get('/api/products', { params: { search: term, pageSize: 10 } });
      const variants: VariantSearchResult[] = response.data.data.items.flatMap((p: any) =>
        p.variants.map((v: any) => ({ ...v, product: { name: p.name } })),
      );
      setSearchResults(variants);
    } finally {
      setSearching(false);
    }
  }

  function addVariantToCart(variant: VariantSearchResult, stock = 999) {
    cart.addLine({
      variantId: variant.id,
      productName: variant.product.name,
      size: variant.size.label,
      color: variant.color.name,
      sku: variant.sku,
      unitPrice: Number(variant.sellingPrice),
      quantity: 1,
      discountAmount: 0,
      availableStock: stock,
    });
  }

  async function handleCheckout() {
    if (!activeBranchId) {
      setCheckoutError('يرجى اختيار الفرع أولًا');
      return;
    }
    if (cart.lines.length === 0) return;

    // Hard safety rule (spec §17): never show a success receipt unless the
    // server has actually persisted the sale. We do not optimistically
    // clear the cart or print anything before the API call resolves.
    if (!isOnline) {
      setCheckoutError('لا يوجد اتصال بالإنترنت — لا يمكن إتمام عملية البيع حتى يعود الاتصال');
      return;
    }

    setSubmitting(true);
    setCheckoutError(null);
    try {
      const subtotal = cart.subtotal();
      const response = await apiClient.post('/api/sales', {
        branchId: activeBranchId,
        customerId: cart.customerId ?? undefined,
        items: cart.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: canDiscount ? l.discountAmount : 0,
        })),
        payments: [{ method: paymentMethod, amount: subtotal }],
        discountAmount: 0,
        clientRequestId,
      });

      const sale = response.data.data;
      const branchName = branches.find((b) => b.id === activeBranchId)?.name ?? '';
      setLastReceipt({
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        storeName: user?.tenantName ?? 'نظام إدارة محلات الأحذية',
        branchName,
        cashierName: user?.fullName ?? '',
        customerName: selectedCustomer?.label,
        paymentMethod,
        lines: cart.lines.map((l) => ({
          productName: l.productName,
          size: l.size,
          color: l.color,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: canDiscount ? l.discountAmount : 0,
        })),
        discountAmount: 0,
        totalAmount: Number(sale.totalAmount),
      });
      cart.clear();
      setSelectedCustomer(null);
      // Fresh idempotency key for the NEXT sale — reusing the same key
      // would cause the next checkout to be treated as a retry of this one.
      setClientRequestId(generateClientRequestId());
    } catch (err) {
      // On a network failure the clientRequestId is intentionally NOT
      // rotated — if the cashier presses "checkout" again, the retry uses
      // the same idempotency key, so even if the first request actually
      // reached the server and succeeded (but the response was lost), the
      // backend returns the SAME sale instead of creating a duplicate.
      setCheckoutError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const subtotal = cart.subtotal();

  return (
    <div className="grid h-full grid-cols-3 gap-6">
      {/* Search & results */}
      <div className="col-span-2 flex flex-col">
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="امسح الباركود أو ابحث بالاسم / SKU"
            className="w-full rounded-xl border border-slate-300 py-3 pr-10 pl-4 text-lg focus:border-brand-500 focus:outline-none"
          />
        </div>

        {searching && <p className="text-sm text-slate-400">جارِ البحث...</p>}

        <div className="grid grid-cols-2 gap-3 overflow-y-auto">
          {searchResults.map((v) => (
            <button
              key={v.id}
              onClick={() => addVariantToCart(v)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-brand-400 hover:shadow-md"
            >
              <div className="font-semibold">{v.product.name}</div>
              <div className="text-sm text-slate-500">
                مقاس {v.size.label} · {v.color.name}
              </div>
              <div className="mt-1 font-bold text-brand-600">{formatCurrency(Number(v.sellingPrice))}</div>
            </button>
          ))}
        </div>

        {/* Cart */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {cart.lines.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400">السلة فارغة</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="p-3 text-right">المنتج</th>
                  <th className="p-3">الكمية</th>
                  <th className="p-3">السعر</th>
                  {canDiscount && <th className="p-3">الخصم</th>}
                  <th className="p-3">الإجمالي</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {cart.lines.map((line) => (
                  <tr key={line.variantId} className="border-b border-slate-50">
                    <td className="p-3">
                      <div className="font-medium">{line.productName}</div>
                      <div className="text-xs text-slate-400">
                        {line.size} · {line.color}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => cart.updateQuantity(line.variantId, line.quantity - 1)} className="rounded bg-slate-100 p-1">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center">{line.quantity}</span>
                        <button onClick={() => cart.updateQuantity(line.variantId, line.quantity + 1)} className="rounded bg-slate-100 p-1">
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-center">{line.unitPrice.toFixed(2)}</td>
                    {canDiscount && (
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min={0}
                          value={line.discountAmount}
                          onChange={(e) => cart.updateDiscount(line.variantId, Number(e.target.value))}
                          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center"
                        />
                      </td>
                    )}
                    <td className="p-3 text-center font-semibold">
                      {(line.quantity * line.unitPrice - line.discountAmount).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <button onClick={() => cart.removeLine(line.variantId)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Checkout panel */}
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">إتمام البيع</h2>

        <div className="mb-4">
          <AsyncPicker
            label="العميل (اختياري)"
            value={selectedCustomer}
            onChange={setSelectedCustomer}
            fetchOptions={fetchCustomerOptions}
            placeholder="بيع بدون تحديد عميل"
          />
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setPaymentMethod('CASH')}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium ${paymentMethod === 'CASH' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200'}`}
          >
            نقدًا
          </button>
          <button
            onClick={() => setPaymentMethod('CARD')}
            className={`flex-1 rounded-lg border py-2 text-sm font-medium ${paymentMethod === 'CARD' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200'}`}
          >
            بطاقة
          </button>
        </div>

        <div className="mb-4 space-y-2 border-t border-b border-slate-100 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">عدد القطع</span>
            <span>{cart.lines.reduce((s, l) => s + l.quantity, 0)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>الإجمالي</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
        </div>

        {checkoutError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{checkoutError}</div>}

        {!isOnline && (
          <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            لا يوجد اتصال بالإنترنت. لن يتم قبول أي عملية بيع حتى يعود الاتصال، لضمان عدم فقدان أو تكرار البيانات.
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={submitting || cart.lines.length === 0 || !isOnline}
          className="mt-auto rounded-xl bg-brand-600 py-3 text-base font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'جارِ إتمام العملية...' : 'إتمام البيع'}
        </button>

        {lastReceipt && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="mb-2 flex items-center justify-between font-semibold">
              <span>تم البيع بنجاح ✅</span>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
              >
                <Printer size={14} /> طباعة الإيصال
              </button>
            </div>
            <div>رقم الفاتورة: {lastReceipt.invoiceNumber}</div>
            <div>الإجمالي: {formatCurrency(lastReceipt.totalAmount)}</div>
          </div>
        )}

        {!isSocketConnected && (
          <p className="mt-2 text-center text-xs text-slate-400">
            ملاحظة: قناة التحديث الفوري غير متصلة حاليًا، لكن عمليات البيع لا تزال تُحفظ مباشرة عبر الخادم.
          </p>
        )}
      </div>

      {/* The actual printable receipt. Hidden on screen — the summary box
          above is what the cashier sees — and made visible exclusively by
          the print stylesheet (.print-receipt, see styles/index.css) when
          "طباعة الإيصال" triggers window.print(), so the printout is a
          clean, real itemized invoice rather than a screenshot of the
          whole POS screen. */}
      {lastReceipt && (
        <div className="print-receipt hidden print:block">
          <Receipt data={lastReceipt} />
        </div>
      )}
    </div>
  );
}
