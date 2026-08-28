import { create } from 'zustand';

export interface CartLine {
  variantId: string;
  productName: string;
  size: string;
  color: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  availableStock: number;
}

interface CartState {
  branchId: string | null;
  customerId: string | null;
  lines: CartLine[];
  setBranch: (branchId: string | null) => void;
  setCustomer: (customerId: string | null) => void;
  addLine: (line: CartLine) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  updateDiscount: (variantId: string, discount: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
  subtotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  branchId: null,
  customerId: null,
  lines: [],
  setBranch: (branchId) => set({ branchId }),
  setCustomer: (customerId) => set({ customerId }),
  addLine: (line) =>
    set((state) => {
      const existing = state.lines.find((l) => l.variantId === line.variantId);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.variantId === line.variantId
              ? { ...l, quantity: Math.min(l.quantity + line.quantity, l.availableStock) }
              : l,
          ),
        };
      }
      return { lines: [...state.lines, line] };
    }),
  updateQuantity: (variantId, quantity) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(quantity, l.availableStock)) } : l,
      ),
    })),
  updateDiscount: (variantId, discount) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.variantId === variantId ? { ...l, discountAmount: Math.max(0, discount) } : l)),
    })),
  removeLine: (variantId) => set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),
  clear: () => set({ lines: [], customerId: null }),
  subtotal: () => get().lines.reduce((sum, l) => sum + l.quantity * l.unitPrice - l.discountAmount, 0),
}));
