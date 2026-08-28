import { useSettingsStore } from '../state/settingsStore';

/**
 * Formats a monetary amount using the tenant's configured currency label
 * (Settings.currency — freeform text, e.g. "ج.م", "USD", "ر.س"). This is a
 * plain function (not a hook) so it can be called from anywhere, including
 * inside .map() callbacks and non-component helper files — it reads the
 * current value directly from the Zustand store via getState().
 *
 * Previously every page hardcoded the literal suffix "ج.م" regardless of
 * what was configured in Settings, silently ignoring the currency field
 * entirely. This is the fix: change the currency once in Settings, and
 * every amount displayed anywhere in the app reflects it immediately.
 */
export function formatCurrency(amount: number): string {
  const currency = useSettingsStore.getState().currency;
  return `${amount.toFixed(2)} ${currency}`;
}
