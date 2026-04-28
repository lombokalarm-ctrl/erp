import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    if (!currentPassword.trim()) return false;
    if (newPassword.length < 6) return false;
    if (confirmPassword !== newPassword) return false;
    return true;
  }, [currentPassword, newPassword, confirmPassword]);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ganti Password</h1>
        <p className="mt-1 text-sm text-zinc-600">Perbarui password akun kamu.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3">
          <Input
            label="Password Lama"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="Password Baru"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            label="Konfirmasi Password Baru"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          <Button
            disabled={!canSubmit || loading}
            onClick={async () => {
              setError(null);
              setSuccess(null);
              setLoading(true);
              try {
                await apiFetch("/api/v1/auth/change-password", {
                  method: "POST",
                  body: JSON.stringify({ currentPassword, newPassword }),
                });
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setSuccess("Password berhasil diperbarui");
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Gagal mengganti password");
              } finally {
                setLoading(false);
              }
            }}
          >
            Simpan Password
          </Button>
        </div>
      </Card>
    </div>
  );
}

