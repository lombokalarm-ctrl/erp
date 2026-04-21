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

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean },
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (!init?.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

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

