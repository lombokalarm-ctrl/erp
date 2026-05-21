import { create } from "zustand";

export type FieldUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
};

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: FieldUser | null;
  setAuth: (token: string, refreshToken: string, user: unknown) => void;
  logout: () => void;
  hydrate: () => void;
};

const STORAGE_KEY = "madani_field_auth_v1";

function normalizeUser(user: unknown): FieldUser {
  const value = (user ?? {}) as Record<string, unknown>;
  return {
    id: String(value.id ?? ""),
    email: String(value.email ?? ""),
    fullName: String(value.fullName ?? value.full_name ?? value.name ?? ""),
    role: String(value.role ?? ""),
    permissions: Array.isArray(value.permissions)
      ? value.permissions.map((item) => String(item))
      : [],
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  setAuth: (token, refreshToken, user) => {
    const normalizedUser = normalizeUser(user);
    set({ token, refreshToken, user: normalizedUser });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken, user: normalizedUser }));
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
        user?: unknown;
      };
      if (parsed.token && parsed.refreshToken && parsed.user) {
        set({
          token: parsed.token,
          refreshToken: parsed.refreshToken,
          user: normalizeUser(parsed.user),
        });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
}));
