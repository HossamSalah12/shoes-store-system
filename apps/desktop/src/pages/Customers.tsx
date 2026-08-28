import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { DataTable, PageHeader, PrimaryButton, Modal } from '../components/DataTable';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await apiClient.get('/api/customers', { params: { search: search || undefined } });
      setCustomers(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <PageHeader title="العملاء" action={<PrimaryButton onClick={() => setCreateOpen(true)}>+ عميل جديد</PrimaryButton>} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو رقم الهاتف"
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      <DataTable
        rows={customers}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        columns={[
          { header: 'الاسم', render: (c) => c.name },
          { header: 'الهاتف', render: (c) => c.phone ?? '—' },
          { header: 'العنوان', render: (c) => c.address ?? '—' },
        ]}
      />
      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
    </div>
  );
}

function CreateCustomerModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/api/customers', { name, phone: phone || undefined });
      onDone();
      onClose();
      setName('');
      setPhone('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="عميل جديد">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium">الاسم</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <PrimaryButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'جارِ الحفظ...' : 'حفظ العميل'}
        </PrimaryButton>
      </form>
    </Modal>
  );
}
