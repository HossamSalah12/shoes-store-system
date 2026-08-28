import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: { id: string; code: string; name: string }[];
  branches: { id: string; name: string }[];
}

interface Branch {
  id: string;
  name: string;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  CASHIER: 'كاشير',
};

function roleLabel(role: { code: string; name: string }) {
  return SYSTEM_ROLE_LABELS[role.code] ?? role.name;
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [usersRes, branchesRes, rolesRes] = await Promise.all([
        apiClient.get('/api/users'),
        apiClient.get('/api/branches'),
        apiClient.get('/api/roles'),
      ]);
      setUsers(usersRes.data.data);
      setBranches(branchesRes.data.data);
      setRoles(rolesRes.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeactivate(userId: string) {
    if (!confirm('هل أنت متأكد من إيقاف هذا المستخدم؟')) return;
    try {
      await apiClient.post(`/api/users/${userId}/deactivate`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  async function handleReactivate(userId: string) {
    try {
      await apiClient.patch(`/api/users/${userId}`, { isActive: true });
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title="المستخدمون" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ مستخدم جديد</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={users}
        columns={[
          { header: 'الاسم', render: (u) => u.fullName },
          { header: 'البريد الإلكتروني', render: (u) => u.email },
          { header: 'الدور', render: (u) => u.roles.map(roleLabel).join(', ') || '—' },
          { header: 'الفروع', render: (u) => u.branches.map((b) => b.name).join(', ') || 'كل الفروع' },
          { header: 'الحالة', render: (u) => (u.isActive ? <span className="text-emerald-600">نشط</span> : <span className="text-red-500">موقوف</span>) },
          {
            header: '',
            render: (u) => (
              <div className="flex gap-3 text-sm">
                <button onClick={() => setEditingUser(u)} className="text-brand-600 hover:underline">
                  تعديل
                </button>
                {u.isActive ? (
                  <button onClick={() => handleDeactivate(u.id)} className="text-red-600 hover:underline">
                    إيقاف
                  </button>
                ) : (
                  <button onClick={() => handleReactivate(u.id)} className="text-emerald-600 hover:underline">
                    تفعيل
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} branches={branches} roles={roles} onDone={load} />
      {editingUser && (
        <EditUserModal user={editingUser} branches={branches} roles={roles} onClose={() => setEditingUser(null)} onDone={load} />
      )}
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  branches,
  roles,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  roles: RoleOption[];
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the CASHIER system role once roles load, since it's the
  // most common day-to-day account to create; the admin can still pick a
  // custom role from the dropdown.
  useEffect(() => {
    if (!roleId && roles.length > 0) {
      const cashier = roles.find((r) => r.code === 'CASHIER');
      setRoleId(cashier?.id ?? roles[0].id);
    }
  }, [roles, roleId]);

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/users', { fullName, email, password, roleId, branchIds });
      onDone();
      onClose();
      setFullName('');
      setEmail('');
      setPassword('');
      setBranchIds([]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="مستخدم جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">الاسم الكامل</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">كلمة المرور</label>
          <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الدور</label>
          <select required value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="" disabled>
              اختر دورًا
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r)} {!r.isSystem && '(مخصص)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الفروع المسموح بها</label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">اترك بدون تحديد إذا كان الدور مالكًا (وصول تلقائي لكل الفروع).</p>
        </div>
        <PrimaryButton type="submit" disabled={submitting || !roleId} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'إنشاء المستخدم'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  branches,
  roles,
  onClose,
  onDone,
}: {
  user: UserRow;
  branches: Branch[];
  roles: RoleOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [roleId, setRoleId] = useState(user.roles[0]?.id ?? '');
  const [branchIds, setBranchIds] = useState<string[]>(user.branches.map((b) => b.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/users/${user.id}`, { fullName, roleId: roleId || undefined, branchIds });
      onDone();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`تعديل — ${user.fullName}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">الاسم الكامل</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
          <input disabled value={user.email} className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400" />
          <p className="mt-1 text-xs text-slate-400">لا يمكن تغيير البريد الإلكتروني بعد الإنشاء.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الدور</label>
          <select required value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="" disabled>
              اختر دورًا
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r)} {!r.isSystem && '(مخصص)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الفروع المسموح بها</label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                {b.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">اترك بدون تحديد إذا كان الدور مالكًا (وصول تلقائي لكل الفروع).</p>
        </div>
        <PrimaryButton type="submit" disabled={submitting || !roleId} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ التعديلات'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
