import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 overflow-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900">Daftar Wilayah</h1>
        </div>
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

      <div className="w-80 shrink-0">
        <Card className="p-4">
          <div className="text-sm font-semibold">Tambah Wilayah</div>
          {error && (
            <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">
              {error}
            </div>
          )}
          <div className="mt-4 space-y-3">
            <Input label="Nama Wilayah" value={name} onChange={(e) => setName(e.target.value)} />
            <Button className="w-full" onClick={handleSave}>
              Simpan
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
