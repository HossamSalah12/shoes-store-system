import { create } from 'zustand';

interface RealtimeState {
  /** Incremented on every 'stock:updated' event received over the socket. */
  stockVersion: number;
  /** Incremented on every 'sale:created' or 'sale:cancelled' event. */
  saleVersion: number;
  /** Incremented on every 'return:created' event. */
  returnVersion: number;
  /** Incremented on every 'branch:updated' event. */
  branchVersion: number;
  bumpStock: () => void;
  bumpSale: () => void;
  bumpReturn: () => void;
  bumpBranch: () => void;
}

/**
 * Pages that display data affected by another device's actions (stock
 * levels, sales lists, the dashboard) subscribe to the relevant version
 * number in a `useEffect` dependency array and re-fetch when it changes —
 * e.g. `useEffect(() => { load(); }, [stockVersion])`. This keeps the
 * realtime wiring simple (no separate data-fetching/caching library) while
 * still making the Socket.IO events the backend already emits (see
 * apps/server/src/realtime/socket.ts and every module that calls
 * `getIo()?.to(...).emit(...)`) actually do something in the UI.
 */
export const useRealtimeStore = create<RealtimeState>((set) => ({
  stockVersion: 0,
  saleVersion: 0,
  returnVersion: 0,
  branchVersion: 0,
  bumpStock: () => set((s) => ({ stockVersion: s.stockVersion + 1 })),
  bumpSale: () => set((s) => ({ saleVersion: s.saleVersion + 1 })),
  bumpReturn: () => set((s) => ({ returnVersion: s.returnVersion + 1 })),
  bumpBranch: () => set((s) => ({ branchVersion: s.branchVersion + 1 })),
}));
