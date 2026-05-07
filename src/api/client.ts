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
let refreshPromise: Promise<{ token: string; refreshToken: string; user: any } | null> | null = null;

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

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (
    res.status === 401 &&
    !init?.skipAuth &&
    (init?._retryOnAuth ?? true) &&
    !path.includes("/api/v1/auth/refresh")
  ) {
    const refreshed = await ensureRefreshedToken();
    if (refreshed) {
      const retryHeaders = new Headers(init?.headers);
      const retryIsFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
      if (!retryIsFormData && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      retryHeaders.set("Authorization", `Bearer ${refreshed.token}`);
      const retried = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: retryHeaders,
      });

      const retriedContentType = retried.headers.get("content-type") || "";
      const retriedIsJson = retriedContentType.includes("application/json");
      const retriedData = retriedIsJson ? await retried.json() : await retried.text();
      if (!retried.ok) {
        const shaped = retriedData as Partial<ApiErrorShape>;
        throw new ApiError(
          shaped.error?.code ?? "HTTP_ERROR",
          shaped.error?.message ?? `Request gagal (${retried.status})`,
          shaped.error?.details,
        );
      }
      return retriedData as T;
    }
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const shaped = data as Partial<ApiErrorShape>;
    throw new ApiError(
      shaped.error?.code ?? "HTTP_ERROR",
      shaped.error?.message ?? `Request gagal (${res.status})`,
      shaped.error?.details,
    );
  }

  return data as T;
}

async function ensureRefreshedToken() {
  const store = useAuthStore.getState();
  if (!store.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: "POST",
          headers,
          body: JSON.stringify({ refreshToken: store.refreshToken }),
        });
        if (!res.ok) {
          useAuthStore.getState().logout();
          return null;
        }
        const payload = (await res.json()) as {
          data: { token: string; accessToken?: string; refreshToken: string; user: any };
        };
        const nextToken = payload.data.accessToken ?? payload.data.token;
        useAuthStore.getState().setAuth(nextToken, payload.data.refreshToken, payload.data.user);
        return {
          token: nextToken,
          refreshToken: payload.data.refreshToken,
          user: payload.data.user,
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

