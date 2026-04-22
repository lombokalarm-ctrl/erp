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
  categoryPrices?: Record<string, { pcs: number; pack: number; dus: number }>;
  unitPrices?: { pcs: number; pack: number; dus: number };
  packSize?: number;
  packPerDus?: number;
  dusSize?: number;
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
  const [unitPrices, setUnitPrices] = useState<{ pcs: string; pack: string; dus: string }>({
    pcs: "0",
    pack: "0",
    dus: "0",
  });
  const [packSize, setPackSize] = useState("1");
  const [packPerDus, setPackPerDus] = useState("1");
  const [categoryPrices, setCategoryPrices] = useState<Record<string, { pcs: string; pack: string; dus: string }>>({
    "RETAIL": { pcs: "0", pack: "0", dus: "0" },
    "GROSIR": { pcs: "0", pack: "0", dus: "0" },
    "MODERN RETAIL": { pcs: "0", pack: "0", dus: "0" },
    "HOREKA": { pcs: "0", pack: "0", dus: "0" },
    "NASIONAL MODERN RETAIL": { pcs: "0", pack: "0", dus: "0" }
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
    setUnitPrices({
      pcs: String(p.unitPrices?.pcs ?? Number(p.salePrice) ?? 0),
      pack: String(p.unitPrices?.pack ?? 0),
      dus: String(p.unitPrices?.dus ?? 0),
    });
    setPackSize(String(p.packSize ?? 1));
    setPackPerDus(String(p.packPerDus ?? 1));
    setCategoryPrices({
      "RETAIL": { 
        pcs: String(p.categoryPrices?.["RETAIL"]?.pcs || 0), 
        pack: String(p.categoryPrices?.["RETAIL"]?.pack || 0), 
        dus: String(p.categoryPrices?.["RETAIL"]?.dus || 0) 
      },
      "GROSIR": { 
        pcs: String(p.categoryPrices?.["GROSIR"]?.pcs || 0), 
        pack: String(p.categoryPrices?.["GROSIR"]?.pack || 0), 
        dus: String(p.categoryPrices?.["GROSIR"]?.dus || 0) 
      },
      "MODERN RETAIL": { 
        pcs: String(p.categoryPrices?.["MODERN RETAIL"]?.pcs || 0), 
        pack: String(p.categoryPrices?.["MODERN RETAIL"]?.pack || 0), 
        dus: String(p.categoryPrices?.["MODERN RETAIL"]?.dus || 0) 
      },
      "HOREKA": { 
        pcs: String(p.categoryPrices?.["HOREKA"]?.pcs || 0), 
        pack: String(p.categoryPrices?.["HOREKA"]?.pack || 0), 
        dus: String(p.categoryPrices?.["HOREKA"]?.dus || 0) 
      },
      "NASIONAL MODERN RETAIL": { 
        pcs: String(p.categoryPrices?.["NASIONAL MODERN RETAIL"]?.pcs || 0), 
        pack: String(p.categoryPrices?.["NASIONAL MODERN RETAIL"]?.pack || 0), 
        dus: String(p.categoryPrices?.["NASIONAL MODERN RETAIL"]?.dus || 0) 
      },
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("pcs");
    setPurchasePrice("0");
    setSalePrice("0");
    setUnitPrices({ pcs: "0", pack: "0", dus: "0" });
    setPackSize("1");
    setPackPerDus("1");
    setCategoryPrices({
      "RETAIL": { pcs: "0", pack: "0", dus: "0" },
      "GROSIR": { pcs: "0", pack: "0", dus: "0" },
      "MODERN RETAIL": { pcs: "0", pack: "0", dus: "0" },
      "HOREKA": { pcs: "0", pack: "0", dus: "0" },
      "NASIONAL MODERN RETAIL": { pcs: "0", pack: "0", dus: "0" }
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
                  <th className="px-4 py-2 whitespace-nowrap">Sat. Dasar</th>
                  <th className="px-4 py-2">Harga Beli</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Pcs</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Pack</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Dus</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Retail (Pcs|Pack|Dus)</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Grosir (Pcs|Pack|Dus)</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Modern Retail (Pcs|Pack|Dus)</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Horeka (Pcs|Pack|Dus)</th>
                  <th className="px-4 py-2 whitespace-nowrap">H. Nasional MR (Pcs|Pack|Dus)</th>
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
                    <td className="px-4 py-2">{p.unitPrices?.pcs ?? p.salePrice}</td>
                    <td className="px-4 py-2">{p.unitPrices?.pack ?? "-"}</td>
                    <td className="px-4 py-2">{p.unitPrices?.dus ?? "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["RETAIL"] ? `${p.categoryPrices["RETAIL"].pcs}|${p.categoryPrices["RETAIL"].pack}|${p.categoryPrices["RETAIL"].dus}` : "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["GROSIR"] ? `${p.categoryPrices["GROSIR"].pcs}|${p.categoryPrices["GROSIR"].pack}|${p.categoryPrices["GROSIR"].dus}` : "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["MODERN RETAIL"] ? `${p.categoryPrices["MODERN RETAIL"].pcs}|${p.categoryPrices["MODERN RETAIL"].pack}|${p.categoryPrices["MODERN RETAIL"].dus}` : "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["HOREKA"] ? `${p.categoryPrices["HOREKA"].pcs}|${p.categoryPrices["HOREKA"].pack}|${p.categoryPrices["HOREKA"].dus}` : "-"}</td>
                    <td className="px-4 py-2">{p.categoryPrices?.["NASIONAL MODERN RETAIL"] ? `${p.categoryPrices["NASIONAL MODERN RETAIL"].pcs}|${p.categoryPrices["NASIONAL MODERN RETAIL"].pack}|${p.categoryPrices["NASIONAL MODERN RETAIL"].dus}` : "-"}</td>
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
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={13}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
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
              <div className="text-xs font-semibold text-zinc-600">Harga Jual per Satuan</div>
              <div className="grid grid-cols-1 gap-3">
                <Input
                  label="Harga Pcs"
                  value={unitPrices.pcs}
                  onChange={(e) => setUnitPrices((p) => ({ ...p, pcs: e.target.value }))}
                />
                <Input
                  label="Harga Pack"
                  value={unitPrices.pack}
                  onChange={(e) => setUnitPrices((p) => ({ ...p, pack: e.target.value }))}
                />
                <Input
                  label="Harga Dus"
                  value={unitPrices.dus}
                  onChange={(e) => setUnitPrices((p) => ({ ...p, dus: e.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
              <div className="text-xs font-semibold text-zinc-600">Konversi Satuan</div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="1 Pack = (pcs)"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                />
                <Input
                  label="1 Dus = (pack)"
                  value={packPerDus}
                  onChange={(e) => setPackPerDus(e.target.value)}
                />
              </div>
              <Input
                label="1 Dus = (pcs)"
                value={String((Number(packSize) || 1) * (Number(packPerDus) || 1))}
                readOnly
              />
            </div>
            
            <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
              <div className="text-xs font-semibold text-zinc-600">Harga Per Kategori Pelanggan</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="pb-2 font-medium">Kategori</th>
                      <th className="pb-2 font-medium">H. Pcs</th>
                      <th className="pb-2 font-medium">H. Pack</th>
                      <th className="pb-2 font-medium">H. Dus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(categoryPrices).map((cat) => (
                      <tr key={cat} className="border-b border-zinc-100 last:border-0">
                        <td className="py-2 pr-2 text-xs font-medium text-zinc-700">{cat}</td>
                        <td className="py-2 pr-2">
                          <Input
                            value={categoryPrices[cat].pcs}
                            onChange={(e) => setCategoryPrices(prev => ({ ...prev, [cat]: { ...prev[cat], pcs: e.target.value } }))}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={categoryPrices[cat].pack}
                            onChange={(e) => setCategoryPrices(prev => ({ ...prev, [cat]: { ...prev[cat], pack: e.target.value } }))}
                          />
                        </td>
                        <td className="py-2">
                          <Input
                            value={categoryPrices[cat].dus}
                            onChange={(e) => setCategoryPrices(prev => ({ ...prev, [cat]: { ...prev[cat], dus: e.target.value } }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      unitPrices: {
                        pcs: Number(unitPrices.pcs) || 0,
                        pack: Number(unitPrices.pack) || 0,
                        dus: Number(unitPrices.dus) || 0,
                      },
                      packSize: Number(packSize) || 1,
                      packPerDus: Number(packPerDus) || 1,
                      categoryPrices: {
                        "RETAIL": {
                          pcs: Number(categoryPrices["RETAIL"].pcs) || 0,
                          pack: Number(categoryPrices["RETAIL"].pack) || 0,
                          dus: Number(categoryPrices["RETAIL"].dus) || 0,
                        },
                        "GROSIR": {
                          pcs: Number(categoryPrices["GROSIR"].pcs) || 0,
                          pack: Number(categoryPrices["GROSIR"].pack) || 0,
                          dus: Number(categoryPrices["GROSIR"].dus) || 0,
                        },
                        "MODERN RETAIL": {
                          pcs: Number(categoryPrices["MODERN RETAIL"].pcs) || 0,
                          pack: Number(categoryPrices["MODERN RETAIL"].pack) || 0,
                          dus: Number(categoryPrices["MODERN RETAIL"].dus) || 0,
                        },
                        "HOREKA": {
                          pcs: Number(categoryPrices["HOREKA"].pcs) || 0,
                          pack: Number(categoryPrices["HOREKA"].pack) || 0,
                          dus: Number(categoryPrices["HOREKA"].dus) || 0,
                        },
                        "NASIONAL MODERN RETAIL": {
                          pcs: Number(categoryPrices["NASIONAL MODERN RETAIL"].pcs) || 0,
                          pack: Number(categoryPrices["NASIONAL MODERN RETAIL"].pack) || 0,
                          dus: Number(categoryPrices["NASIONAL MODERN RETAIL"].dus) || 0,
                        },
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
