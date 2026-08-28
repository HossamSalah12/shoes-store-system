import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../state/authStore';

interface Branch {
  id: string;
  name: string;
  isActive: boolean;
}

export function BranchSelector() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const setActiveBranch = useAuthStore((s) => s.setActiveBranch);

  useEffect(() => {
    apiClient.get('/api/branches').then((res) => {
      const allBranches: Branch[] = res.data.data;
      // The backend already returns only branches for this tenant; here we
      // further narrow to branches this user is allowed to operate in
      // (Owners see all, Managers/Cashiers see their assignment) purely for
      // UX — the backend re-verifies on every write regardless.
      const isOwner = user?.roles.includes('OWNER');
      const allowed = isOwner ? allBranches : allBranches.filter((b) => user?.branchIds.includes(b.id));
      setBranches(allowed);
      if (!activeBranchId && allowed.length > 0) {
        setActiveBranch(allowed[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      value={activeBranchId ?? ''}
      onChange={(e) => setActiveBranch(e.target.value)}
    >
      <option value="" disabled>
        اختر الفرع
      </option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
