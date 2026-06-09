import { useAuthStore } from "@/stores/authStore";

type ApiErrorShape = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
let refreshPromise: Promise<{ token: string; refreshToken: string } | null> | null = null;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean; _retryOnAuth?: boolean },
): Promise<T> {
  const store = useAuthStore.getState();
  const token = store.token;
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!init?.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    !init?.skipAuth &&
    (init?._retryOnAuth ?? true) &&
    !path.includes("/api/v1/auth/refresh")
  ) {
    const refreshed = await ensureRefreshedToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...init, _retryOnAuth: false });
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const shaped = data as Partial<ApiErrorShape>;
    throw new ApiError(
      shaped.error?.code ?? "HTTP_ERROR",
      shaped.error?.message ?? `Request gagal (${response.status})`,
      shaped.error?.details,
    );
  }

  return data as T;
}

export async function apiFetchBlob(
  path: string,
  init?: RequestInit & { skipAuth?: boolean; _retryOnAuth?: boolean },
): Promise<{ blob: Blob; filename: string | null }> {
  const store = useAuthStore.getState();
  const token = store.token;
  const headers = new Headers(init?.headers);

  if (!init?.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    !init?.skipAuth &&
    (init?._retryOnAuth ?? true) &&
    !path.includes("/api/v1/auth/refresh")
  ) {
    const refreshed = await ensureRefreshedToken();
    if (refreshed) {
      return apiFetchBlob(path, { ...init, _retryOnAuth: false });
    }
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    const shaped = data as Partial<ApiErrorShape>;
    throw new ApiError(
      shaped.error?.code ?? "HTTP_ERROR",
      shaped.error?.message ?? `Request gagal (${response.status})`,
      shaped.error?.details,
    );
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  return {
    blob,
    filename: filenameMatch?.[1] ?? null,
  };
}

async function ensureRefreshedToken() {
  const store = useAuthStore.getState();
  if (!store.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken: store.refreshToken }),
        });

        if (!response.ok) {
          useAuthStore.getState().logout();
          return null;
        }

        const payload = (await response.json()) as {
          data: { token: string; accessToken?: string; refreshToken: string; user: unknown };
        };
        useAuthStore
          .getState()
          .setAuth(payload.data.accessToken ?? payload.data.token, payload.data.refreshToken, payload.data.user);

        return {
          token: payload.data.accessToken ?? payload.data.token,
          refreshToken: payload.data.refreshToken,
        };
      } catch {
        useAuthStore.getState().logout();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}
