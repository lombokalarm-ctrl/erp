import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type UomRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export default function Uoms() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<UomRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const canSave = useMemo(() => code.trim().length > 0 && name.trim().length > 0, [code, name]);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: UomRow[] }>(
        `/api/v1/uoms?page=1&pageSize=200&q=${encodeURIComponent(q)}`,
      );
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data satuan");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setCode("");
    setName("");
    setIsActive(true);
    setIsFormOpen(false);
  }

  function handleEdit(row: UomRow) {
    setEditingId(row.id);
    setCode(row.code);
    setName(row.name);
    setIsActive(row.isActive);
    setIsFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus satuan ini?")) return;
    try {
      await apiFetch(`/api/v1/uoms/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus satuan");
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    try {
      const payload = {
        code: code.trim().toLowerCase(),
        name: name.trim(),
        isActive,
      };
      if (editingId) {
        await apiFetch(`/api/v1/uoms/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/v1/uoms", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan satuan");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Master Satuan</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola daftar satuan global seperti pcs, pack, dus, bal, karung.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama satuan..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
          <Button onClick={() => setIsFormOpen(true)}>Tambah Satuan</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Satuan</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">Kode</th>
                <th className="px-4 py-2">Nama</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{row.code}</td>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {row.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(row)} className="font-medium text-blue-600 hover:text-blue-800">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(row.id)} className="font-medium text-red-600 hover:text-red-800">
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                    Belum ada data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">{editingId ? "Edit Satuan" : "Tambah Satuan"}</div>
              <button className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" onClick={resetForm}>
                Tutup
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="contoh: karung" />
              <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="contoh: Karung" />
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Aktif
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={resetForm}>
                  Batal
                </Button>
                <Button onClick={handleSave} disabled={!canSave}>
                  {editingId ? "Update" : "Simpan"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
