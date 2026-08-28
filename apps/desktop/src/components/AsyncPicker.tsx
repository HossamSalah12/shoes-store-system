import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface AsyncPickerProps {
  label: string;
  placeholder?: string;
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  /** Called with the current search text; return the matching options. */
  fetchOptions: (query: string) => Promise<PickerOption[]>;
  required?: boolean;
}

/**
 * A searchable select box that fetches options from the API as the user
 * types. Used to replace raw "paste the ID" text inputs (Supplier,
 * Product Variant, Sale, Sale Item, etc.) with a proper pick-from-a-list
 * experience, while still ultimately submitting just the `id` the backend
 * expects.
 */
export function AsyncPicker({ label, placeholder, value, onChange, fetchOptions, required }: AsyncPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetchOptions(query)
        .then(setOptions)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <div>
            <div className="font-medium">{value.label}</div>
            {value.sublabel && <div className="text-xs text-slate-400">{value.sublabel}</div>}
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-red-500">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-right text-sm text-slate-400"
        >
          {placeholder ?? 'اختر...'}
          <ChevronDown size={16} />
        </button>
      )}

      {open && !value && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث..."
              className="w-full rounded-md border-none py-1 pr-8 pl-2 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading && <div className="p-3 text-center text-xs text-slate-400">جارِ البحث...</div>}
            {!loading && options.length === 0 && <div className="p-3 text-center text-xs text-slate-400">لا توجد نتائج</div>}
            {!loading &&
              options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-right text-sm hover:bg-slate-50"
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.sublabel && <span className="text-xs text-slate-400">{opt.sublabel}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
