import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { formatDate } from "@/lib/date";

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type StockMutationReportData = {
  suppliers: SupplierOption[];
  latestMovements: {
    id: string;
    createdAt: string;
    type: string;
    qtyDelta: string;
    sku: string;
    productName: string;
    refType: string | null;
  }[];
};

export default function StockMutationReport() {
  const [data, setData] = useState<StockMutationReportData | null>(null);
  const [q, setQ] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/stocks", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (supplierId) url.searchParams.set("supplierId", supplierId);
      const res = await apiFetch<{ data: StockMutationReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat mutasi stok");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Mutasi Stok Terbaru</h1>
          <p className="mt-1 text-sm text-zinc-600">Pantau pergerakan stok terbaru dengan filter produk dan supplier.</p>
        </div>
        <div className="grid w-full gap-2 md:w-auto md:grid-cols-[240px_240px_auto]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKU / nama produk..."
          />
          <SearchableSelect
            value={supplierId}
            onChange={setSupplierId}
            options={(data?.suppliers ?? []).map((supplier) => ({
              value: supplier.id,
              label: `${supplier.code} - ${supplier.name}`,
            }))}
            placeholder="Semua Supplier"
            searchPlaceholder="Cari supplier..."
          />
          <Button variant="secondary" onClick={load}>
            Filter
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
          Daftar Mutasi Stok Terbaru
        </div>
        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Referensi</th>
                <th className="px-4 py-3 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {(data?.latestMovements ?? []).map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{formatDate(row.createdAt)}</div>
                    <div className="text-xs text-zinc-500">{row.type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.productName}</div>
                    <div className="text-xs text-zinc-500">{row.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{row.refType || "-"}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      Number(row.qtyDelta) < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {Number(row.qtyDelta) > 0 ? "+" : ""}
                    {Number(row.qtyDelta).toFixed(2)}
                  </td>
                </tr>
              ))}
              {!data?.latestMovements?.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                    Belum ada data mutasi stok.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
