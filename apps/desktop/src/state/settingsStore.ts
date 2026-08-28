import { create } from 'zustand';

interface SettingsState {
  /** Free-text currency label as configured in Settings (e.g. "ج.م", "USD", "ر.س"). */
  currency: string;
  setCurrency: (currency: string) => void;
}

/**
 * Populated once after login (see App.tsx) from GET /api/settings, and
 * updated immediately whenever the Owner saves a change on the Settings
 * page — so a currency change takes effect app-wide without requiring a
 * restart. Defaults to the same value Settings.currency defaults to in the
 * database ("EGP" as stored, displayed here as the common EGP shorthand)
 * so nothing looks broken before the initial fetch resolves.
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  currency: 'ج.م',
  setCurrency: (currency) => set({ currency }),
}));
