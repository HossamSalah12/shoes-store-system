import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';
import { useRealtimeStore } from '../state/realtimeStore';
import { formatCurrency } from '../utils/currency';

interface Sale {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  cashier: { fullName: string };
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
  REFUNDED: 'مرتجعة بالكامل',
  PARTIALLY_REFUNDED: 'مرتجعة جزئيًا',
};

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const canCancel = useAuthStore((s) => s.hasPermission(PERMISSIONS.SALE_CANCEL));
  const saleVersion = useRealtimeStore((s) => s.saleVersion);
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await apiClient.get('/api/sales', { params: { branchId: activeBranchId ?? undefined, pageSize: 50 } });
      setSales(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, saleVersion]);

  async function handleCancel(e: React.MouseEvent, saleId: string) {
    e.stopPropagation(); // don't also trigger the row's navigate-to-detail click
    const reason = prompt('سبب الإلغاء؟');
    if (!reason) return;
    try {
      await apiClient.post(`/api/sales/${saleId}/cancel`, { reason });
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title="المبيعات" />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={sales}
        onRowClick={(s) => navigate(`/sales/${s.id}`)}
        columns={[
          { header: 'رقم الفاتورة', render: (s) => s.invoiceNumber },
          { header: 'الكاشير', render: (s) => s.cashier?.fullName ?? '—' },
          { header: 'الإجمالي', render: (s) => formatCurrency(Number(s.totalAmount)) },
          { header: 'الحالة', render: (s) => STATUS_LABELS[s.status] ?? s.status },
          { header: 'التاريخ', render: (s) => new Date(s.createdAt).toLocaleString('ar-EG') },
          {
            header: '',
            render: (s) =>
              canCancel && s.status === 'COMPLETED' ? (
                <button onClick={(e) => handleCancel(e, s.id)} className="text-sm text-red-600 hover:underline">
                  إلغاء
                </button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
