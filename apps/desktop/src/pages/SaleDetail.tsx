import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Printer } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader } from '../components/DataTable';
import { Receipt, type ReceiptData } from '../components/Receipt';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { formatCurrency } from '../utils/currency';

interface SaleItemDetail {
  id: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
  variant: {
    sku: string;
    product: { name: string };
    size: { label: string };
    color: { name: string };
  };
}

interface SaleDetail {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  createdAt: string;
  cancelReason: string | null;
  items: SaleItemDetail[];
  payments: { id: string; method: 'CASH' | 'CARD'; amount: string }[];
  cashier: { fullName: string } | null;
  customer: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  COMPLETED: { label: 'مكتملة', tone: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'ملغاة', tone: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'مرتجعة بالكامل', tone: 'bg-amber-50 text-amber-700' },
  PARTIALLY_REFUNDED: { label: 'مرتجعة جزئيًا', tone: 'bg-amber-50 text-amber-700' },
};

const PAYMENT_LABELS: Record<'CASH' | 'CARD', string> = { CASH: 'نقدًا', CARD: 'بطاقة' };

export function SaleDetailPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const canReturn = useAuthStore((s) => s.hasPermission(PERMISSIONS.RETURN_CREATE));

  useEffect(() => {
    if (!saleId) return;
    apiClient
      .get(`/api/sales/${saleId}`)
      .then((res) => setSale(res.data.data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [saleId]);

  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>;
  if (!sale) return <p className="text-slate-400">جارِ التحميل...</p>;

  const status = STATUS_LABELS[sale.status] ?? { label: sale.status, tone: 'bg-slate-100 text-slate-600' };

  const receiptData: ReceiptData = {
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt,
    storeName: user?.tenantName ?? 'نظام إدارة محلات الأحذية',
    branchName: sale.branch?.name ?? '',
    cashierName: sale.cashier?.fullName ?? '',
    customerName: sale.customer?.name,
    paymentMethod: sale.payments[0]?.method ?? 'CASH',
    lines: sale.items.map((item) => ({
      productName: item.variant.product.name,
      size: item.variant.size.label,
      color: item.variant.color.name,
      sku: item.variant.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
    })),
    discountAmount: Number(sale.discountAmount),
    totalAmount: Number(sale.totalAmount),
  };

  return (
    <div>
      <button onClick={() => navigate('/sales')} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight size={16} /> رجوع للمبيعات
      </button>

      <PageHeader
        title={`فاتورة ${sale.invoiceNumber}`}
        action={
          <div className="flex gap-2">
            {canReturn && sale.status !== 'CANCELLED' && (
              <Link to="/returns" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                إنشاء مرتجع
              </Link>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Printer size={16} /> طباعة
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.tone}`}>{status.label}</span>
        <span className="text-sm text-slate-500">{new Date(sale.createdAt).toLocaleString('ar-EG')}</span>
      </div>

      {sale.cancelReason && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">سبب الإلغاء: {sale.cancelReason}</div>
      )}

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">الكاشير</div>
          <div className="mt-1 font-semibold">{sale.cashier?.fullName ?? '—'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">العميل</div>
          <div className="mt-1 font-semibold">
            {sale.customer ? (
              <Link to={`/customers/${sale.customer.id}`} className="text-brand-600 hover:underline">
                {sale.customer.name}
              </Link>
            ) : (
              '—'
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">طريقة الدفع</div>
          <div className="mt-1 font-semibold">{sale.payments.map((p) => PAYMENT_LABELS[p.method]).join(', ') || '—'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">الإجمالي</div>
          <div className="mt-1 font-bold text-brand-600">{formatCurrency(Number(sale.totalAmount))}</div>
        </div>
      </div>

      <h2 className="mb-3 font-bold">الأصناف</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 text-right font-medium">المنتج</th>
              <th className="p-3 text-center font-medium">الكمية</th>
              <th className="p-3 text-center font-medium">السعر</th>
              <th className="p-3 text-center font-medium">الخصم</th>
              <th className="p-3 text-left font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3">
                  <div className="font-medium">{item.variant.product.name}</div>
                  <div className="text-xs text-slate-400">
                    {item.variant.size.label} · {item.variant.color.name} · {item.variant.sku}
                  </div>
                </td>
                <td className="p-3 text-center">{item.quantity}</td>
                <td className="p-3 text-center">{Number(item.unitPrice).toFixed(2)}</td>
                <td className="p-3 text-center">{Number(item.discountAmount).toFixed(2)}</td>
                <td className="p-3 text-left font-semibold">{Number(item.lineTotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 mr-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>المجموع الفرعي</span>
          <span>{formatCurrency(Number(sale.subtotal))}</span>
        </div>
        {Number(sale.discountAmount) > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>الخصم الإضافي</span>
            <span>-{formatCurrency(Number(sale.discountAmount))}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold">
          <span>الإجمالي</span>
          <span>{formatCurrency(Number(sale.totalAmount))}</span>
        </div>
      </div>

      <div className="print-receipt hidden print:block">
        <Receipt data={receiptData} />
      </div>
    </div>
  );
}
