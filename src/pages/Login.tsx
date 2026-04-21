import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { useAuthStore, type AuthUser } from "@/stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password]);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto grid min-h-dvh max-w-screen-xl place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-zinc-900 text-white">
              <span className="text-sm font-semibold">F&B</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">ERP Distributor</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Login untuk mengakses penjualan, stok, piutang, dan laporan.
            </p>
          </div>

          <Card className="p-5">
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSubmit) return;
                setLoading(true);
                setError(null);
                try {
                  const res = await apiFetch<{
                    data: { token: string; user: AuthUser };
                  }>("/api/v1/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                    skipAuth: true,
                  });

                  setAuth(res.data.token, res.data.user);
                  navigate("/dashboard");
                } catch (err) {
                  if (err instanceof ApiError) setError(err.message);
                  else setError("Login gagal");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Input
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                {loading ? "Masuk..." : "Masuk"}
              </Button>
            </form>
          </Card>

          <div className="mt-4 text-center text-xs text-zinc-500">
            Default seed: admin@local.test / admin123
          </div>
        </div>
      </div>
    </div>
  );
}

