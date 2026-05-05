import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

type Region = {
  id: string;
  name: string;
};

export default function Regions() {
  const [items, setItems] = useState<Region[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function load() {
    try {
      const res = await apiFetch<{ data: Region[] }>("/api/v1/regions");
      setItems(res.data);
    } catch (err: any) {
      console.error(err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!name) return;
    try {
      setError(null);
      await apiFetch("/api/v1/regions", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      setIsFormOpen(false);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">Daftar Wilayah</h1>
        <Button
          onClick={() => {
            setName("");
            setError(null);
            setIsFormOpen(true);
          }}
        >
          Tambah Wilayah
        </Button>
      </div>
      <div className="overflow-auto">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">Nama Wilayah</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-zinc-500">
                      Belum ada data wilayah.
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
          <Card className="w-full max-w-lg p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Tambah Wilayah</div>
                <p className="text-xs text-zinc-500">Isi nama wilayah baru untuk master data pelanggan.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsFormOpen(false)}
              >
                Tutup
              </button>
            </div>
            {error && (
              <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">
                {error}
              </div>
            )}
            <div className="mt-4 space-y-3">
              <Input label="Nama Wilayah" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                  Batal
                </Button>
                <Button onClick={handleSave}>Simpan</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
