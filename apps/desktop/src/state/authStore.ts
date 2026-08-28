import { create } from 'zustand';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  tenantId: string | null;
  tenantName?: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  activeBranchId: string | null;
  isHydrated: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  setActiveBranch: (branchId: string | null) => void;
  clearSession: () => void;
  setHydrated: (v: boolean) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

/**
 * Tokens live ONLY in this in-memory store for the lifetime of the
 * renderer process — never in localStorage/sessionStorage (which Electron
 * artifacts/renderers should avoid for secrets in general, and which would
 * be readable by any injected script). Only the refresh token is persisted
 * across app restarts, and only via the OS-keychain-backed
 * `window.desktopApi.secureStorage` bridge exposed by the preload script.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  activeBranchId: null,
  isHydrated: false,
  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
  setUser: (user) => set({ user }),
  setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
  setHydrated: (v) => set({ isHydrated: v }),
  clearSession: () => {
    void window.desktopApi?.secureStorage.clearRefreshToken();
    set({ accessToken: null, refreshToken: null, user: null, activeBranchId: null });
  },
  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
  hasRole: (role) => get().user?.roles.includes(role) ?? false,
}));
