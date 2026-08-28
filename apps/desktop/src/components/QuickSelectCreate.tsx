import { useState } from 'react';
import { Plus } from 'lucide-react';

export interface QuickOption {
  id: string;
  label: string;
}

interface QuickSelectCreateProps {
  label: string;
  options: QuickOption[];
  value: string; // selected option id, or '' for none
  onChange: (id: string) => void;
  /** Called with the new item's label; must POST and return the created { id, label }. */
  onCreate: (label: string) => Promise<QuickOption>;
  placeholder?: string;
  required?: boolean;
}

/**
 * A `<select>` for a small, tenant-scoped reference list (sizes, colors,
 * brands, categories) with an inline "add new" affordance right next to it
 * — since a brand-new tenant starts with zero sizes/colors, forcing the
 * user out to a separate page before they can create their first product
 * variant would be a dead end. Newly created items are immediately selected.
 */
export function QuickSelectCreate({ label, options, value, onChange, onCreate, placeholder, required }: QuickSelectCreateProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(newLabel.trim());
      onChange(created.id);
      setNewLabel('');
      setAdding(false);
    } catch {
      setError('تعذّر الإضافة — قد تكون موجودة بالفعل');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {!adding ? (
        <div className="flex gap-2">
          <select
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              {placeholder ?? 'اختر...'}
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="إضافة جديد"
            className="flex items-center justify-center rounded-lg border border-slate-300 px-2.5 text-slate-500 hover:bg-slate-50"
          >
            <Plus size={16} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder={`${label} جديد`}
            className="flex-1 rounded-lg border border-brand-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newLabel.trim()}
            className="rounded-lg bg-brand-600 px-3 text-sm text-white disabled:opacity-50"
          >
            {creating ? '...' : 'إضافة'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewLabel('');
              setError(null);
            }}
            className="rounded-lg border border-slate-300 px-2.5 text-slate-500"
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
