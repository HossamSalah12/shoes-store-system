import { useAuthStore } from '../state/authStore';

export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  if (!hasPermission(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        <p className="text-lg font-semibold">لا تملك صلاحية الوصول لهذه الصفحة</p>
        <p className="text-sm">تواصل مع مالك المتجر لطلب الصلاحية المناسبة</p>
      </div>
    );
  }

  return <>{children}</>;
}
