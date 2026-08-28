import { create } from 'zustand';

interface ConnectionState {
  isOnline: boolean;
  isSocketConnected: boolean;
  lastSyncedAt: Date | null;
  setOnline: (v: boolean) => void;
  setSocketConnected: (v: boolean) => void;
  touchSynced: () => void;
}

/**
 * Drives the connection indicator required by the spec (section 17):
 * cashiers must always be able to see, at a glance, whether the app is
 * actually talking to the server. `isSocketConnected` reflects the
 * Socket.IO realtime channel; REST calls (like creating a sale) are
 * independently guarded — the POS screen never shows "sale completed"
 * unless the server responded with a persisted Sale record (see
 * pages/POS.tsx), regardless of what this indicator shows.
 */
export const useConnectionStore = create<ConnectionState>((set) => ({
  isOnline: navigator.onLine,
  isSocketConnected: false,
  lastSyncedAt: null,
  setOnline: (v) => set({ isOnline: v }),
  setSocketConnected: (v) => set({ isSocketConnected: v }),
  touchSynced: () => set({ lastSyncedAt: new Date() }),
}));

window.addEventListener('online', () => useConnectionStore.getState().setOnline(true));
window.addEventListener('offline', () => useConnectionStore.getState().setOnline(false));
