import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type SummaryRow = { productId: string; sku: string; name: string; qty: string };
type Product = { id: string; sku: string; name: string };

export default function Inventory() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [qtyDelta, setQtyDelta] = useState("0");
  const canAdjust = useMemo(() => productId && Number(qtyDelta) !== 0, [productId, qtyDelta]);

  async function load() {
    setError(null);
    try {
      const [s, p] = await Promise.all([
        apiFetch<{ data: SummaryRow[] }>(`/api/v1/inventory/summary?q=${encodeURIComponent(q)}`),
        apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      ]);
      setRows(s.data);
      setProducts(p.data);
      if (!productId && p.data[0]?.id) setProductId(p.data[0].id);
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
          <h1 className="text-lg font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-600">Stok ringkas dan penyesuaian stok (adjustment).</p>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Stok Ringkas</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{r.sku}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.qty}</td>
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

        <Card className="p-4">
          <div className="text-sm font-semibold">Stock Adjustment</div>
          <div className="mt-1 text-sm text-zinc-600">Qty Delta bisa positif (masuk) atau negatif (keluar).</div>
          <div className="mt-3 grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Produk</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Input label="Qty Delta" value={qtyDelta} onChange={(e) => setQtyDelta(e.target.value)} />
            <Button
              disabled={!canAdjust}
              onClick={async () => {
                setError(null);
                try {
                  await apiFetch("/api/v1/inventory/adjustments", {
                    method: "POST",
                    body: JSON.stringify({ productId, qtyDelta: Number(qtyDelta) }),
                  });
                  setQtyDelta("0");
                  await load();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Gagal melakukan adjustment");
                }
              }}
            >
              Simpan Adjustment
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

