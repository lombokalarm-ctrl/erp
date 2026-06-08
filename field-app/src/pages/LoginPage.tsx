import { useMemo, useState } from "react";
import { ArrowRight, Smartphone, Truck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, ApiError } from "@/api/client";
import SurfaceCard from "@/components/SurfaceCard";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = useMemo(() => email.trim() && password.trim(), [email, password]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{
        data: {
          token: string;
          accessToken?: string;
          refreshToken: string;
          user: unknown;
        };
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      });
      setAuth(response.data.accessToken ?? response.data.token, response.data.refreshToken, response.data.user);
      const target = (location.state as { from?: string } | undefined)?.from ?? "/visits";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#bef264_0%,#f7f5ef_26%,#e5e7eb_100%)] px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col justify-between">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-[22px] bg-emerald-950 text-white shadow-lg">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">PWA Lapangan</div>
              <div className="text-2xl font-semibold text-zinc-950">Madani Field</div>
            </div>
          </div>

          <SurfaceCard className="rounded-[32px] border-emerald-200/60 bg-white/85 p-5">
            <div className="flex items-center gap-3 rounded-[24px] bg-emerald-50 px-4 py-3">
              <Smartphone className="h-5 w-5 text-emerald-700" />
              <div className="text-sm text-emerald-900">
                Untuk Sales dan Driver saat kunjungan toko, antar barang, dan input order cepat.
              </div>
            </div>
            <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Saat testing, setelah login aplikasi akan langsung masuk ke halaman kunjungan.
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Email</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field-input"
                  autoComplete="email"
                  placeholder="nama@madaninaulicemerlang.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field-input"
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                />
              </div>

              {error ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <button type="submit" disabled={!canSubmit || loading} className="primary-button">
                <span>{loading ? "Masuk..." : "Masuk ke Lapangan"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </SurfaceCard>
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Gunakan akun ERP yang memiliki role Sales atau Driver.
        </div>
      </div>
    </div>
  );
}
