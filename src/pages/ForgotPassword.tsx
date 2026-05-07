import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 3, [email]);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto grid min-h-dvh max-w-screen-xl place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <Card className="p-5">
            <div className="mb-4">
              <h1 className="text-xl font-semibold">Lupa Password</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Masukkan email akun Anda. Kami akan kirim link reset password.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSubmit) return;
                setLoading(true);
                setError(null);
                setSuccess(null);
                try {
                  const res = await apiFetch<{ data: { message: string } }>("/api/v1/auth/forgot-password", {
                    method: "POST",
                    body: JSON.stringify({ email }),
                    skipAuth: true,
                  });
                  setSuccess(res.data.message ?? "Jika email terdaftar, link reset telah dikirim.");
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Gagal memproses permintaan.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              ) : null}
              {success ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {success}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
                {loading ? "Mengirim..." : "Kirim Link Reset"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/login")}>
                Kembali ke Login
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
