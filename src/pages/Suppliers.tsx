import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Supplier = { id: string; code: string; name: string; phone: string | null; address: string | null };

export default function Suppliers() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const canCreate = useMemo(() => code.trim() && name.trim(), [code, name]);

  function handleEdit(s: Supplier) {
    setEditingId(s.id);
    setCode(s.code);
    setName(s.name);
    setIsFormOpen(true);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setCode("");
    setName("");
    setError(null);
    setIsFormOpen(false);
  }

  function handleOpenCreate() {
    handleCancelEdit();
    setIsFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus supplier ini?")) return;
    try {
      await apiFetch(`/api/v1/suppliers/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus supplier");
    }
  }

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: Supplier[] }>(
        "/api/v1/suppliers?page=1&pageSize=50&q=" + encodeURIComponent(q),
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Supplier</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola supplier/pabrik.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode/nama..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
          <Button onClick={handleOpenCreate}>Tambah Supplier</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div>
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Supplier</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">Kode</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{s.code}</td>
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(s)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={3}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{editingId ? "Edit Supplier" : "Tambah Supplier"}</div>
                <p className="text-xs text-zinc-500">Isi kode dan nama supplier untuk master pembelian.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={handleCancelEdit}
              >
                Tutup
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SUP-001" />
              <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="PT Pabrik" />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancelEdit}>
                  Batal
                </Button>
                <Button
                  disabled={!canCreate}
                  onClick={async () => {
                    setError(null);
                    try {
                      if (editingId) {
                        await apiFetch(`/api/v1/suppliers/${editingId}`, { method: "PATCH", body: JSON.stringify({ code, name }) });
                      } else {
                        await apiFetch("/api/v1/suppliers", { method: "POST", body: JSON.stringify({ code, name }) });
                      }
                      handleCancelEdit();
                      await load();
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Gagal menyimpan supplier");
                    }
                  }}
                >
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

