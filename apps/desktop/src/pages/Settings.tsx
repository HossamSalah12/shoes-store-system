import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { PageHeader, PrimaryButton } from '../components/DataTable';
import { useSettingsStore } from '../state/settingsStore';

interface Settings {
  currency: string;
  locale: string;
  invoicePrefix: string;
  lowStockThreshold: number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setCurrency = useSettingsStore((s) => s.setCurrency);

  useEffect(() => {
    apiClient
      .get('/api/settings')
      .then((res) => {
        setSettings(res.data.data);
        setCurrency(res.data.data.currency);
      })
      .catch((err) => setError(extractErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiClient.patch('/api/settings', settings);
      setSettings(res.data.data);
      // Takes effect immediately across the whole app — no restart, no
      // re-navigation needed — since every amount is formatted via
      // formatCurrency(), which reads live from this store.
      setCurrency(res.data.data.currency);
      setMessage('تم حفظ الإعدادات بنجاح');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p className="text-slate-400">جارِ التحميل...</p>;

  return (
    <div>
      <PageHeader title="الإعدادات" />
      {message && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-700">{message}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}

      <form onSubmit={handleSave} className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">العملة</label>
          <input
            value={settings.currency}
            onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">اللغة</label>
          <select
            value={settings.locale}
            onChange={(e) => setSettings({ ...settings, locale: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">بادئة رقم الفاتورة</label>
          <input
            value={settings.invoicePrefix}
            onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">حد التنبيه لانخفاض المخزون</label>
          <input
            type="number"
            min={0}
            value={settings.lowStockThreshold}
            onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <PrimaryButton type="submit" disabled={saving} className="w-full">
          {saving ? 'جارِ الحفظ...' : 'حفظ الإعدادات'}
        </PrimaryButton>
      </form>
    </div>
  );
}
