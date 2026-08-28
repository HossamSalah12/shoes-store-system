import { formatCurrency } from '../utils/currency';

export interface ReceiptLine {
  productName: string;
  size: string;
  color: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

export interface ReceiptData {
  invoiceNumber: string;
  createdAt: string;
  storeName: string;
  branchName: string;
  cashierName: string;
  customerName?: string;
  paymentMethod: 'CASH' | 'CARD';
  lines: ReceiptLine[];
  discountAmount: number;
  totalAmount: number;
}

const PAYMENT_LABELS: Record<'CASH' | 'CARD', string> = { CASH: 'نقدًا', CARD: 'بطاقة' };

/**
 * The actual printable receipt markup. Rendered inside a `.print-receipt`
 * wrapper (see styles/index.css) so that `window.print()` shows only this,
 * not the surrounding POS screen.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const subtotal = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const lineDiscounts = data.lines.reduce((sum, l) => sum + l.discountAmount, 0);

  return (
    <div className="mx-auto max-w-sm bg-white p-6 text-sm text-slate-900" dir="rtl">
      <div className="mb-4 text-center">
        <h1 className="text-lg font-bold">{data.storeName}</h1>
        <p className="text-slate-500">{data.branchName}</p>
      </div>

      <div className="mb-3 space-y-0.5 border-b border-dashed border-slate-300 pb-3 text-xs text-slate-600">
        <div className="flex justify-between">
          <span>رقم الفاتورة</span>
          <span className="font-mono">{data.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>التاريخ</span>
          <span>{new Date(data.createdAt).toLocaleString('ar-EG')}</span>
        </div>
        <div className="flex justify-between">
          <span>الكاشير</span>
          <span>{data.cashierName}</span>
        </div>
        {data.customerName && (
          <div className="flex justify-between">
            <span>العميل</span>
            <span>{data.customerName}</span>
          </div>
        )}
      </div>

      <table className="mb-3 w-full border-b border-dashed border-slate-300 pb-2 text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 text-right font-medium">الصنف</th>
            <th className="py-1 text-center font-medium">كمية</th>
            <th className="py-1 text-center font-medium">سعر</th>
            <th className="py-1 text-left font-medium">إجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5">
                <div>{l.productName}</div>
                <div className="text-slate-400">
                  {l.size} · {l.color} · {l.sku}
                </div>
              </td>
              <td className="py-1.5 text-center">{l.quantity}</td>
              <td className="py-1.5 text-center">{l.unitPrice.toFixed(2)}</td>
              <td className="py-1.5 text-left font-medium">{(l.quantity * l.unitPrice - l.discountAmount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-4 space-y-1 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>المجموع الفرعي</span>
          <span>{subtotal.toFixed(2)}</span>
        </div>
        {(lineDiscounts > 0 || data.discountAmount > 0) && (
          <div className="flex justify-between text-slate-600">
            <span>الخصم</span>
            <span>-{(lineDiscounts + data.discountAmount).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold">
          <span>الإجمالي</span>
          <span>{formatCurrency(data.totalAmount)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>طريقة الدفع</span>
          <span>{PAYMENT_LABELS[data.paymentMethod]}</span>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">شكرًا لتعاملكم معنا</p>
    </div>
  );
}
