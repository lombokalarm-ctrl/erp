import { useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToExcel } from "@/lib/exportUtils";

type Supplier = { id: string; code: string; name: string; phone: string | null; address: string | null };
type SupplierImportSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors?: { row: number; message: string; code?: string }[];
};

export default function Suppliers() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<SupplierImportSummary | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
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

  function handleDownloadTemplate() {
    exportToExcel("template-import-supplier.xlsx", ["Kode", "Supplier"], [["SUP001", "Nama Supplier"]]);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ data: SupplierImportSummary }>("/api/v1/suppliers/import", {
        method: "POST",
        body: form,
      });
      setImportSummary(res.data);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import supplier gagal");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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
        <div className="flex flex-wrap gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode/nama..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
          <Button variant="secondary" onClick={handleDownloadTemplate}>
            Unduh Template XLSX
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
            }}
          />
          <Button
            variant="secondary"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Mengimpor..." : "Import Excel"}
          </Button>
          <Button onClick={handleOpenCreate}>Tambah Supplier</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-2 text-sm text-zinc-600">
          <div className="font-semibold text-zinc-900">Import Supplier dari Excel</div>
          <p>
            File mendukung kolom <span className="font-medium">Kode</span> dan{" "}
            <span className="font-medium">Supplier</span>. Header alternatif yang juga diterima:
            <span className="font-medium"> code</span>, <span className="font-medium">name</span>, dan{" "}
            <span className="font-medium">nama</span>.
          </p>
          <p>Import berjalan dengan mode upsert berdasarkan kode supplier.</p>
        </div>
        {importSummary ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <div>
              Total: <span className="font-semibold">{importSummary.total}</span> | Dibuat:{" "}
              <span className="font-semibold text-emerald-700">{importSummary.created}</span> | Diperbarui:{" "}
              <span className="font-semibold text-blue-700">{importSummary.updated}</span> | Gagal:{" "}
              <span className="font-semibold text-red-700">{importSummary.failed}</span>
            </div>
            {importSummary.errors?.length ? (
              <div className="mt-2 max-h-36 overflow-auto rounded border border-red-100 bg-white p-2 text-red-700">
                {importSummary.errors.slice(0, 20).map((err, idx) => (
                  <div key={idx}>
                    Baris {err.row}: {err.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

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

