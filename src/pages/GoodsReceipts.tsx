import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Warehouse = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string };
type GrnRow = { id: string; grnNo: string; receivedDate: string; warehouseCode: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function GoodsReceipts() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [items, setItems] = useState<{ productId: string; qty: string; uom: "pcs" | "pack" | "dus" }[]>([{ productId: "", qty: "1", uom: "pcs" }]);

  const canSubmit = useMemo(
    () => warehouseId && items.every((i) => i.productId && Number(i.qty) > 0),
    [warehouseId, items],
  );

  async function load() {
    const [w, p, grn] = await Promise.all([
      apiFetch<{ data: Warehouse[] }>("/api/v1/warehouses"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: GrnRow[] }>("/api/v1/goods-receipts?page=1&pageSize=50"),
    ]);
    setWarehouses(w.data);
    setProducts(p.data);
    setRows(grn.data);
    if (!warehouseId && w.data[0]?.id) setWarehouseId(w.data[0].id);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Penerimaan Barang (GRN)</h1>
        <p className="mt-1 text-sm text-zinc-600">Mencatat barang masuk dan otomatis menambah stok.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="p-4">
          <div className="text-sm font-semibold">Buat GRN</div>
          <div className="mt-3 grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Gudang</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">Pilih gudang</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>
            </label>

            <Input label="Tanggal Terima" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />

            <div className="rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">Item</div>
              <div className="grid gap-2 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid gap-2">
                    <select
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      value={it.productId}
                      onChange={(e) =>
                        setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)))
                      }
                    >
                      <option value="">Pilih produk</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" min="1" label="Qty" value={it.qty} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-zinc-600">Satuan</div>
                        <select
                          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                          value={it.uom}
                          onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, uom: e.target.value as "pcs" | "pack" | "dus" } : x))}
                        >
                          <option value="pcs">pcs</option>
                          <option value="pack">pack</option>
                          <option value="dus">dus</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={items.length === 1}
                        onClick={() => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))}
                        type="button"
                      >
                        Hapus
                      </Button>
                      {idx === items.length - 1 ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", uom: "pcs" }])}
                        >
                          Tambah Item
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              disabled={!canSubmit}
              onClick={async () => {
                setError(null);
                try {
                  await apiFetch("/api/v1/goods-receipts", {
                    method: "POST",
                    body: JSON.stringify({
                      warehouseId,
                      receivedDate,
                      items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), uom: i.uom })),
                    }),
                  });
                  setItems([{ productId: "", qty: "1", uom: "pcs" }]);
                  await load();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Gagal membuat GRN");
                }
              }}
            >
              Simpan GRN
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar GRN</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">No</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Gudang</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{r.grnNo}</td>
                    <td className="px-4 py-2">{r.receivedDate}</td>
                    <td className="px-4 py-2">{r.warehouseCode}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
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
    </div>
  );
}

