import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return token.length > 0 && password.length >= 6 && confirmPassword === password;
  }, [token, password, confirmPassword]);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto grid min-h-dvh max-w-screen-xl place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <Card className="p-5">
            <div className="mb-4">
              <h1 className="text-xl font-semibold">Reset Password</h1>
              <p className="mt-1 text-sm text-zinc-600">Masukkan password baru untuk akun Anda.</p>
            </div>
            {!token ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Token reset tidak ditemukan. Silakan ulangi proses lupa password.
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!canSubmit) return;
                  setLoading(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    await apiFetch("/api/v1/auth/reset-password", {
                      method: "POST",
                      body: JSON.stringify({
                        token,
                        newPassword: password,
                      }),
                      skipAuth: true,
                    });
                    setSuccess("Password berhasil direset. Silakan login dengan password baru.");
                    setTimeout(() => navigate("/login"), 1200);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Reset password gagal.");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Input
                  label="Password Baru"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  label="Konfirmasi Password Baru"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  error={
                    confirmPassword.length > 0 && confirmPassword !== password
                      ? "Konfirmasi password tidak sama"
                      : null
                  }
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
                  {loading ? "Menyimpan..." : "Simpan Password Baru"}
                </Button>
              </form>
            )}
            <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => navigate("/login")}>
              Kembali ke Login
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
