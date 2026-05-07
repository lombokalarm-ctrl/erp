import { create } from "zustand";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
};

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  setTokenPair: (token: string, refreshToken: string) => void;
  logout: () => void;
  hydrate: () => void;
  hasAnyPermission: (perms: string[]) => boolean;
};

const STORAGE_KEY = "erp_auth_v1";

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  setAuth: (token, refreshToken, user) => {
    set({ token, refreshToken, user });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken, user }));
  },
  setTokenPair: (token, refreshToken) => {
    const user = get().user;
    set({ token, refreshToken });
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken, user }));
    }
  },
  logout: () => {
    set({ token: null, refreshToken: null, user: null });
    localStorage.removeItem(STORAGE_KEY);
  },
  hydrate: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        token?: string;
        refreshToken?: string;
        user?: AuthUser;
      };
      if (parsed.token && parsed.refreshToken && parsed.user) {
        set({ token: parsed.token, refreshToken: parsed.refreshToken, user: parsed.user });
      } else if (parsed.token && parsed.user) {
        // backward compatibility for old storage format
        set({ token: parsed.token, refreshToken: null, user: parsed.user });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
  hasAnyPermission: (perms) => {
    const user = get().user;
    if (!user) return false;
    return perms.some((p) => user.permissions.includes(p));
  },
}));

