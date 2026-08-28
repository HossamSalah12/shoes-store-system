import { LogOut } from 'lucide-react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { useAuthStore } from '../state/authStore';
import { BranchSelector } from './BranchSelector';

export function TopBar() {
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <BranchSelector />
      <div className="flex items-center gap-4">
        <ConnectionIndicator />
        <button
          onClick={clearSession}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <LogOut size={16} />
          تسجيل الخروج
        </button>
      </div>
    </header>
  );
}
