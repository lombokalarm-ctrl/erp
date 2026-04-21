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
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
  hasAnyPermission: (perms: string[]) => boolean;
};

const STORAGE_KEY = "erp_auth_v1";

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  setAuth: (token, user) => {
    set({ token, user });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
  },
  logout: () => {
    set({ token: null, user: null });
    localStorage.removeItem(STORAGE_KEY);
  },
  hydrate: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
      if (parsed.token && parsed.user) set({ token: parsed.token, user: parsed.user });
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

