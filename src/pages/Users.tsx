import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";

type Role = { id: string; name: string };
type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
};

export default function Users() {
  const canWrite = useAuthStore((s) => s.hasAnyPermission(["users:write"]));
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const canCreate = useMemo(
    () => canWrite && email.trim() && fullName.trim() && password.length >= 6 && roleId,
    [canWrite, email, fullName, password, roleId],
  );

  async function load() {
    setError(null);
    try {
      const [r, u] = await Promise.all([
        apiFetch<{ data: Role[] }>("/api/v1/roles"),
        apiFetch<{ data: UserRow[] }>("/api/v1/users?page=1&pageSize=50"),
      ]);
      setRoles(r.data);
      setUsers(u.data);
      if (!roleId && r.data[0]?.id) setRoleId(r.data[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Manajemen User</h1>
        <p className="mt-1 text-sm text-zinc-600">Kelola user, role, dan status aktif.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar User</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{u.email}</td>
                    <td className="px-4 py-2">{u.fullName}</td>
                    <td className="px-4 py-2">{u.role}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-200 text-zinc-700"}`}>
                        {u.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {canWrite ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPassword("");
                              setResetConfirm("");
                              setResetError(null);
                              setResetSuccess(null);
                            }}
                          >
                            Reset Password
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await apiFetch(`/api/v1/users/${u.id}/active`, {
                              method: "PATCH",
                              body: JSON.stringify({ isActive: !u.isActive }),
                            });
                            await load();
                          }}
                        >
                          {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={5}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold">Tambah User</div>
          <div className="mt-3 grid gap-3">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Nama" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Role</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <Button
              disabled={!canCreate}
              onClick={async () => {
                setError(null);
                try {
                  await apiFetch("/api/v1/users", {
                    method: "POST",
                    body: JSON.stringify({ email, fullName, password, roleId }),
                  });
                  setEmail("");
                  setFullName("");
                  setPassword("");
                  await load();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Gagal membuat user");
                }
              }}
            >
              Simpan User
            </Button>
          </div>

          {canWrite ? (
            <div className="mt-6 border-t border-zinc-200 pt-4">
              <div className="text-sm font-semibold">Reset Password User</div>
              <p className="mt-1 text-xs text-zinc-600">Pilih user dari tabel, lalu isi password baru.</p>

              {resetError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resetError}</div>
              ) : null}
              {resetSuccess ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resetSuccess}</div>
              ) : null}

              <div className="mt-3 grid gap-3">
                <Input label="Target" value={resetTarget ? `${resetTarget.fullName} (${resetTarget.email})` : ""} readOnly />
                <Input
                  label="Password Baru"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                />
                <Input
                  label="Konfirmasi Password"
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                />

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={!resetTarget}
                    onClick={() => {
                      setResetTarget(null);
                      setResetPassword("");
                      setResetConfirm("");
                      setResetError(null);
                      setResetSuccess(null);
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    disabled={!resetTarget || resetPassword.length < 6 || resetPassword !== resetConfirm}
                    onClick={async () => {
                      setResetError(null);
                      setResetSuccess(null);
                      try {
                        await apiFetch(`/api/v1/users/${resetTarget!.id}/reset-password`, {
                          method: "POST",
                          body: JSON.stringify({ newPassword: resetPassword }),
                        });
                        setResetSuccess("Password user berhasil direset");
                        setResetPassword("");
                        setResetConfirm("");
                      } catch (e) {
                        setResetError(e instanceof ApiError ? e.message : "Gagal reset password");
                      }
                    }}
                  >
                    Reset Password
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

