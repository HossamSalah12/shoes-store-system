import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';

interface Role {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

interface PermissionDef {
  key: string;
  description: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  CASHIER: 'كاشير',
};

// Group permission keys by their prefix (e.g. "sale.create" -> "sale") for
// a more scannable checkbox layout than one long flat list.
function groupByCategory(permissions: PermissionDef[]): Record<string, PermissionDef[]> {
  const groups: Record<string, PermissionDef[]> = {};
  for (const p of permissions) {
    const category = p.key.split('.')[0];
    groups[category] ??= [];
    groups[category].push(p);
  }
  return groups;
}

const CATEGORY_LABELS: Record<string, string> = {
  platform: 'المنصة',
  branch: 'الفروع',
  user: 'المستخدمون',
  role: 'الأدوار',
  product: 'المنتجات',
  inventory: 'المخزون',
  purchase: 'المشتريات',
  supplier: 'الموردون',
  customer: 'العملاء',
  pos: 'نقطة البيع',
  sale: 'المبيعات',
  return: 'المرتجعات',
  expense: 'المصروفات',
  report: 'التقارير',
  settings: 'الإعدادات',
  subscription: 'الاشتراك',
  audit: 'سجل التدقيق',
};

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.ROLE_MANAGE));

  async function load() {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.get('/api/roles'),
        canManage ? apiClient.get('/api/roles/permissions') : Promise.resolve({ data: { data: [] } }),
      ]);
      setRoles(rolesRes.data.data);
      setAllPermissions(permsRes.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(role: Role) {
    if (!confirm(`هل أنت متأكد من حذف دور "${role.name}"؟`)) return;
    try {
      await apiClient.delete(`/api/roles/${role.id}`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  const grouped = groupByCategory(allPermissions);

  return (
    <div>
      <PageHeader
        title="الأدوار والصلاحيات"
        action={canManage && <PrimaryButton onClick={() => setCreateOpen(true)}>+ دور مخصص جديد</PrimaryButton>}
      />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        {roles.map((role) => (
          <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">
                {ROLE_LABELS[role.code] ?? role.name}
                {!role.isSystem && <span className="mr-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">مخصص</span>}
              </h3>
              {canManage && (
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setEditingRole(role)} className="text-brand-600 hover:underline">
                    تعديل الصلاحيات
                  </button>
                  {!role.isSystem && (
                    <button onClick={() => handleDelete(role)} className="text-red-600 hover:underline">
                      حذف
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="mb-2 text-xs text-slate-400">{role.userCount} مستخدم مرتبط بهذا الدور</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-slate-600">
              {role.permissions.length === 0 && <li className="text-slate-400">لا توجد صلاحيات</li>}
              {role.permissions.map((p) => (
                <li key={p} className="rounded bg-slate-50 px-2 py-1 font-mono text-xs">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-400">
        الأدوار الأساسية (مالك، مدير فرع، كاشير) لا يمكن حذفها، لكن يمكنك تعديل صلاحياتها. يمكنك أيضًا إنشاء أدوار مخصصة بصلاحيات مختارة بدقة.
      </p>

      {canManage && (
        <>
          <CreateRoleModal open={createOpen} onClose={() => setCreateOpen(false)} groupedPermissions={grouped} onDone={load} />
          {editingRole && (
            <EditRolePermissionsModal
              role={editingRole}
              groupedPermissions={grouped}
              onClose={() => setEditingRole(null)}
              onDone={load}
            />
          )}
        </>
      )}
    </div>
  );
}

function PermissionCheckboxGroups({
  grouped,
  selected,
  onToggle,
}: {
  grouped: Record<string, PermissionDef[]>;
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
      {Object.entries(grouped).map(([category, perms]) => (
        <div key={category}>
          <div className="mb-1 text-xs font-bold text-slate-500">{CATEGORY_LABELS[category] ?? category}</div>
          <div className="grid grid-cols-2 gap-1">
            {perms.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => onToggle(p.key)} />
                <span title={p.key}>{p.description}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateRoleModal({
  open,
  onClose,
  groupedPermissions,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  groupedPermissions: Record<string, PermissionDef[]>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/roles', { name, permissions: Array.from(selected) });
      onDone();
      onClose();
      setName('');
      setSelected(new Set());
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="دور مخصص جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم الدور</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مشرف مخزون" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الصلاحيات</label>
          <PermissionCheckboxGroups grouped={groupedPermissions} selected={selected} onToggle={toggle} />
        </div>
        <PrimaryButton type="submit" disabled={submitting || !name.trim()} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'إنشاء الدور'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditRolePermissionsModal({
  role,
  groupedPermissions,
  onClose,
  onDone,
}: {
  role: Role;
  groupedPermissions: Record<string, PermissionDef[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/roles/${role.id}/permissions`, { permissions: Array.from(selected) });
      onDone();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`تعديل صلاحيات: ${ROLE_LABELS[role.code] ?? role.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        {role.code === 'OWNER' && (
          <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            تنبيه: إزالة صلاحيات أساسية من دور المالك قد يمنعك من إدارة متجرك بشكل كامل لاحقًا.
          </div>
        )}
        <PermissionCheckboxGroups grouped={groupedPermissions} selected={selected} onToggle={toggle} />
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ الصلاحيات'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
