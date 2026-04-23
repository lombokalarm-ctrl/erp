import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type SummaryRow = {
  productId: string;
  sku: string;
  name: string;
  qty: string;
  packSize: number;
  packPerDus: number;
  dusSize: number;
};
type Product = { id: string; sku: string; name: string };

type TransactionRow = {
  id: string;
  type: string;
  qtyDelta: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  warehouseCode: string;
  sku: string;
  productName: string;
};

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<"summary" | "transactions">("summary");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [txRows, setTxRows] = useState<TransactionRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [qtyDelta, setQtyDelta] = useState("0");
  const canAdjust = useMemo(() => productId && Number(qtyDelta) !== 0, [productId, qtyDelta]);

  async function load() {
    setError(null);
    try {
      const [s, p, tx] = await Promise.all([
        apiFetch<{ data: SummaryRow[] }>(`/api/v1/inventory/summary?q=${encodeURIComponent(q)}`),
        apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
        apiFetch<{ data: TransactionRow[] }>("/api/v1/inventory/transactions?page=1&pageSize=100"),
      ]);
      setRows(s.data);
      setProducts(p.data);
      setTxRows(tx.data);
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
          <p className="mt-1 text-sm text-zinc-600">Stok ringkas, penyesuaian stok, dan riwayat pergerakan stok (Kartu Stok).</p>
        </div>
        {activeTab === "summary" && (
          <div className="flex gap-2">
            <div className="w-full md:w-72">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SKU / nama..." />
            </div>
            <Button variant="secondary" onClick={load}>
              Cari
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("summary")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "summary"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Stok Ringkas
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "transactions"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Kartu Stok (Riwayat)
          </button>
        </nav>
      </div>

      {activeTab === "summary" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Stok Ringkas</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2 text-right">Stok Total (Pcs)</th>
                  <th className="px-4 py-2 text-right">Stok (Dus, Pack, Pcs)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const qtyPcs = Math.trunc(Number(r.qty) || 0);
                  const packPcs = Math.max(1, Number(r.packSize) || 1);
                  const dusPcs =
                    Math.max(1, Number(r.dusSize) || 0) ||
                    Math.max(1, (Number(r.packPerDus) || 1) * packPcs);
                  const dus = Math.floor(qtyPcs / dusPcs);
                  const rem1 = qtyPcs % dusPcs;
                  const pack = Math.floor(rem1 / packPcs);
                  const pcs = rem1 % packPcs;

                  let formattedStock = [];
                  if (dus > 0) formattedStock.push(`${dus} Dus`);
                  if (pack > 0) formattedStock.push(`${pack} Pack`);
                  if (pcs > 0 || formattedStock.length === 0) formattedStock.push(`${pcs} Pcs`);

                  return (
                    <tr key={r.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium">{r.sku}</td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right font-medium">{qtyPcs}</td>
                      <td className="px-4 py-2 text-right text-zinc-600">{formattedStock.join(', ')}</td>
                    </tr>
                  );
                })}
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
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-3">Tanggal & Waktu</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3">Tipe Transaksi</th>
                  <th className="px-4 py-3 text-right">Perubahan Qty</th>
                  <th className="px-4 py-3">Referensi</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2">{new Date(t.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 font-medium">
                      <div className="text-zinc-900">{t.sku}</div>
                      <div className="text-xs text-zinc-500 font-normal">{t.productName}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800">
                        {t.type}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(t.qtyDelta) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {Number(t.qtyDelta) > 0 ? "+" : ""}{t.qtyDelta}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {t.refType ? `${t.refType} #${t.refId?.slice(0,8)}` : "-"}
                    </td>
                  </tr>
                ))}
                {txRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Belum ada riwayat transaksi stok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
