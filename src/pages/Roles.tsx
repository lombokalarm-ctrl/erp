import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Permission = {
  id: string;
  code: string;
  description: string;
};

type Role = {
  id: string;
  name: string;
  permissions?: string[];
};

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiFetch<{ data: Role[] }>("/api/v1/roles"),
        apiFetch<{ data: Permission[] }>("/api/v1/roles/permissions")
      ]);
      setRoles(rolesRes.data);
      setPermissions(permsRes.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data role");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleEdit(r: Role) {
    setEditingId(r.id);
    setName(r.name);
    setSelectedPerms(r.permissions || []);
    setError(null);
  }

  function handleCancel() {
    setEditingId(null);
    setName("");
    setSelectedPerms([]);
    setError(null);
  }

  function togglePerm(code: string) {
    if (selectedPerms.includes(code)) {
      setSelectedPerms(selectedPerms.filter(p => p !== code));
    } else {
      setSelectedPerms([...selectedPerms, code]);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await apiFetch(`/api/v1/roles/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ name, permissions: selectedPerms }),
        });
      } else {
        await apiFetch("/api/v1/roles", {
          method: "POST",
          body: JSON.stringify({ name, permissions: selectedPerms }),
        });
      }
      handleCancel();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan role");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus role ini?")) return;
    try {
      await apiFetch(`/api/v1/roles/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Gagal menghapus role");
    }
  }

  // Grup permission berdasarkan awalan
  const groupedPerms = permissions.reduce((acc, p) => {
    const group = p.code.split(':')[0];
    if (!acc[group]) acc[group] = [];
    acc[group].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Manajemen Role & Akses</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Atur peran (role) pengguna dan hak akses (permissions) mereka terhadap menu.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card className="p-4">
            <div className="mb-4 text-sm font-semibold">
              {editingId ? "Edit Role" : "Tambah Role Baru"}
            </div>
            <div className="space-y-3">
              <Input 
                label="Nama Role" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="Contoh: Supervisor"
              />
              
              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-zinc-600">Hak Akses Menu</div>
                <div className="max-h-[300px] overflow-y-auto rounded-md border border-zinc-200 p-2 text-sm">
                  {Object.entries(groupedPerms).map(([group, perms]) => (
                    <div key={group} className="mb-3">
                      <div className="mb-1 font-bold uppercase text-zinc-500 text-[10px]">{group}</div>
                      <div className="space-y-1 pl-1">
                        {perms.map(p => (
                          <label key={p.code} className="flex items-center gap-2 text-zinc-700">
                            <input 
                              type="checkbox" 
                              checked={selectedPerms.includes(p.code)}
                              onChange={() => togglePerm(p.code)}
                              className="rounded border-zinc-300"
                            />
                            <span>{p.description || p.code}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button disabled={saving || !name.trim()} onClick={handleSave} className="flex-1">
                  {saving ? "Menyimpan..." : "Simpan"}
                </Button>
                {editingId && (
                  <Button variant="secondary" onClick={handleCancel}>Batal</Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-3">Nama Role</th>
                    <th className="px-4 py-3">Hak Akses</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => {
                    const isSystem = ["Admin", "Manager", "Sales"].includes(r.name);
                    return (
                      <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">
                          {r.name}
                          {isSystem && <span className="ml-2 text-[10px] bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded">Sistem</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {r.permissions?.map(p => (
                              <span key={p} className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded border border-emerald-100">
                                {p}
                              </span>
                            ))}
                            {(!r.permissions || r.permissions.length === 0) && (
                              <span className="text-xs text-zinc-400">Tidak ada akses</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => handleEdit(r)}>
                            Edit
                          </Button>
                          {!isSystem && (
                            <Button size="sm" variant="secondary" className="ml-2 bg-red-50 text-red-600 hover:bg-red-100" onClick={() => handleDelete(r.id)}>
                              Hapus
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
