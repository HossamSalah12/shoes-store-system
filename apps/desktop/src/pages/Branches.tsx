import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';
import { useAuthStore } from '../state/authStore';
import { PERMISSIONS } from '@shoes/shared';

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = useAuthStore((s) => s.hasPermission(PERMISSIONS.BRANCH_CREATE));
  const canUpdate = useAuthStore((s) => s.hasPermission(PERMISSIONS.BRANCH_UPDATE));
  const canDelete = useAuthStore((s) => s.hasPermission(PERMISSIONS.BRANCH_DELETE));

  async function load() {
    try {
      const res = await apiClient.get('/api/branches');
      setBranches(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(branch: Branch) {
    const confirmMsg = branch.isActive
      ? `هل أنت متأكد من حذف/إيقاف فرع "${branch.name}"؟ لو كان له سجل مبيعات سابق سيتم إيقافه فقط (لن يُحذف نهائيًا) للحفاظ على السجلات المالية.`
      : `الفرع "${branch.name}" موقوف بالفعل. هل تريد المحاولة مرة أخرى؟`;
    if (!confirm(confirmMsg)) return;
    try {
      await apiClient.delete(`/api/branches/${branch.id}`);
      load();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title="الفروع" action={canCreate && <PrimaryButton onClick={() => setCreateOpen(true)}>+ فرع جديد</PrimaryButton>} />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={branches}
        columns={[
          { header: 'الاسم', render: (b) => b.name },
          { header: 'العنوان', render: (b) => b.address ?? '—' },
          { header: 'الهاتف', render: (b) => b.phone ?? '—' },
          { header: 'الحالة', render: (b) => (b.isActive ? <span className="text-emerald-600">نشط</span> : <span className="text-red-500">موقوف</span>) },
          {
            header: '',
            render: (b) => (
              <div className="flex gap-3 text-sm">
                {canUpdate && (
                  <button onClick={() => setEditingBranch(b)} className="text-brand-600 hover:underline">
                    تعديل
                  </button>
                )}
                {canDelete && b.isActive && (
                  <button onClick={() => handleDelete(b)} className="text-red-600 hover:underline">
                    حذف/إيقاف
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
      <CreateBranchModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
      {editingBranch && <EditBranchModal branch={editingBranch} onClose={() => setEditingBranch(null)} onDone={load} />}
    </div>
  );
}

function CreateBranchModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/branches', { name, address: address || undefined, phone: phone || undefined });
      onDone();
      onClose();
      setName('');
      setAddress('');
      setPhone('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="فرع جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم الفرع</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ الفرع'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

function EditBranchModal({ branch, onClose, onDone }: { branch: Branch; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? '');
  const [phone, setPhone] = useState(branch.phone ?? '');
  const [isActive, setIsActive] = useState(branch.isActive);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.patch(`/api/branches/${branch.id}`, {
        name,
        address: address || undefined,
        phone: phone || undefined,
        isActive,
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
    <Modal open onClose={onClose} title={`تعديل — ${branch.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">اسم الفرع</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          الفرع نشط
        </label>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ التعديلات'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
