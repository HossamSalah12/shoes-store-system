import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader } from '../components/DataTable';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
}

// Human-readable labels for the action keys recorded throughout the
// backend (see the `action:` values passed to recordAudit() across
// apps/server/src/modules/*). Falls back to the raw key for anything not
// explicitly mapped, so a newly-added action never silently disappears.
const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'تسجيل دخول',
  'auth.change_password': 'تغيير كلمة المرور',
  'branch.create': 'إنشاء فرع',
  'branch.update': 'تعديل فرع',
  'branch.deactivate': 'إيقاف فرع',
  'branch.delete': 'حذف فرع',
  'user.create': 'إنشاء مستخدم',
  'user.update': 'تعديل مستخدم',
  'user.deactivate': 'إيقاف مستخدم',
  'role.create': 'إنشاء دور مخصص',
  'role.update_permissions': 'تعديل صلاحيات دور',
  'role.delete': 'حذف دور مخصص',
  'product.create': 'إنشاء منتج',
  'product.update': 'تعديل منتج',
  'product.add_variant': 'إضافة متغير لمنتج',
  'inventory.adjust': 'تسوية مخزون',
  'inventory.transfer': 'نقل مخزون بين الفروع',
  'purchase.create': 'عملية شراء',
  'supplier.create': 'إنشاء مورد',
  'supplier.update': 'تعديل مورد',
  'supplier.payment': 'دفعة لمورد',
  'customer.create': 'إنشاء عميل',
  'customer.update': 'تعديل عميل',
  'sale.create': 'عملية بيع',
  'sale.cancel': 'إلغاء عملية بيع',
  'return.create': 'مرتجع',
  'expense.create': 'تسجيل مصروف',
  'settings.update': 'تعديل الإعدادات',
};

const SENSITIVE_ACTIONS = new Set(['user.deactivate', 'branch.delete', 'role.delete', 'sale.cancel', 'role.update_permissions']);

function summarizeMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ');
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get('/api/audit-logs', { params: { page, pageSize: 50 } })
      .then((res) => {
        setEntries(res.data.data.items);
        setTotalPages(res.data.data.totalPages);
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <PageHeader title="سجل التدقيق" />
      <p className="mb-4 text-sm text-slate-500">
        سجل كامل بكل العمليات الحساسة في متجرك: تسجيل الدخول، إنشاء/حذف المستخدمين والفروع، تعديل الصلاحيات، عمليات البيع والإلغاء، تسويات المخزون، وغيرها.
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}

      {loading ? (
        <p className="text-slate-400">جارِ التحميل...</p>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">لا توجد سجلات بعد</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 text-right font-medium">العملية</th>
                <th className="p-3 text-right font-medium">بواسطة</th>
                <th className="p-3 text-right font-medium">التفاصيل</th>
                <th className="p-3 text-right font-medium">التاريخ والوقت</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const detail = summarizeMetadata(entry.metadata);
                const isSensitive = SENSITIVE_ACTIONS.has(entry.action);
                return (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isSensitive ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="p-3">
                      {entry.user ? (
                        <div>
                          <div className="font-medium">{entry.user.fullName}</div>
                          <div className="text-xs text-slate-400">{entry.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">النظام</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate p-3 text-xs text-slate-500" title={detail ?? undefined}>
                      {detail ?? '—'}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('ar-EG')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-slate-500">
            صفحة {page} من {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
