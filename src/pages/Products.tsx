import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  categoryPrices?: Record<string, number>;
};

export default function Products() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [categoryPrices, setCategoryPrices] = useState<Record<string, string>>({
    "RETAIL": "0",
    "GROSIR": "0",
    "MODERN RETAIL": "0",
    "HOREKA": "0",
    "NASIONAL MODERN RETAIL": "0"
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  const canCreate = useMemo(() => sku.trim() && name.trim(), [sku, name]);

  function handleEdit(p: Product) {
    setEditingId(p.id);
    setSku(p.sku);
    setName(p.name);
    setUnit(p.unit);
    setPurchasePrice(p.purchasePrice);
    setSalePrice(p.salePrice);
    setCategoryPrices({
      "RETAIL": String(p.categoryPrices?.["RETAIL"] || 0),
      "GROSIR": String(p.categoryPrices?.["GROSIR"] || 0),
      "MODERN RETAIL": String(p.categoryPrices?.["MODERN RETAIL"] || 0),
      "HOREKA": String(p.categoryPrices?.["HOREKA"] || 0),
      "NASIONAL MODERN RETAIL": String(p.categoryPrices?.["NASIONAL MODERN RETAIL"] || 0),
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("pcs");
    setPurchasePrice("0");
    setSalePrice("0");
    setCategoryPrices({
      "RETAIL": "0",
      "GROSIR": "0",
      "MODERN RETAIL": "0",
      "HOREKA": "0",
      "NASIONAL MODERN RETAIL": "0"
    });
    setError(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus produk ini?")) return;
    try {
      await apiFetch(`/api/v1/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus produk");
    }
  }

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: Product[] }>(
        "/api/v1/products?page=1&pageSize=50&q=" + encodeURIComponent(q),
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
          <h1 className="text-lg font-semibold">Produk</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola SKU, satuan, harga beli, dan harga jual.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SKU / nama..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Produk</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Satuan</th>
                  <th className="px-4 py-2">Harga Beli</th>
                  <th className="px-4 py-2">Harga Jual</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Retail</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Grosir</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Modern Retail</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Horeka</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Nasional MR</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{p.sku}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2">{p.unit}</td>
                    <td className="px-4 py-2">{p.purchasePrice}</td>
                    <td className="px-4 py-2">{p.salePrice}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["RETAIL"] || "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["GROSIR"] || "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["MODERN RETAIL"] || "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["HOREKA"] || "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["NASIONAL MODERN RETAIL"] || "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={11}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold">{editingId ? "Edit Produk" : "Tambah Produk"}</div>
          <div className="mt-3 grid gap-3">
            <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
            <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teh Botol 350ml" />
            <Input label="Satuan" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs/dus" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Harga Beli (Dasar)" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
              <Input label="Harga Jual (Dasar)" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            
            <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
              <div className="text-xs font-semibold text-zinc-600">Harga Per Kategori Pelanggan</div>
              {Object.keys(categoryPrices).map((cat) => (
                <Input
                  key={cat}
                  label={`Harga ${cat}`}
                  value={categoryPrices[cat]}
                  onChange={(e) => setCategoryPrices(prev => ({ ...prev, [cat]: e.target.value }))}
                />
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                disabled={!canCreate}
                onClick={async () => {
                  setError(null);
                  try {
                    const payload = {
                      sku,
                      name,
                      unit,
                      purchasePrice: Number(purchasePrice),
                      salePrice: Number(salePrice),
                      categoryPrices: {
                        "RETAIL": Number(categoryPrices["RETAIL"]) || 0,
                        "GROSIR": Number(categoryPrices["GROSIR"]) || 0,
                        "MODERN RETAIL": Number(categoryPrices["MODERN RETAIL"]) || 0,
                        "HOREKA": Number(categoryPrices["HOREKA"]) || 0,
                        "NASIONAL MODERN RETAIL": Number(categoryPrices["NASIONAL MODERN RETAIL"]) || 0,
                      }
                    };
                    if (editingId) {
                      await apiFetch(`/api/v1/products/${editingId}`, {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                      });
                    } else {
                      await apiFetch("/api/v1/products", {
                        method: "POST",
                        body: JSON.stringify(payload),
                      });
                    }
                    handleCancelEdit();
                    await load();
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "Gagal menyimpan produk");
                  }
                }}
              >
                {editingId ? "Update" : "Simpan"}
              </Button>
              {editingId && (
                <Button className="flex-1" variant="secondary" onClick={handleCancelEdit}>
                  Batal
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

