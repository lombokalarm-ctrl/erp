import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { Download, Printer } from "lucide-react";
import { exportToExcel, printTable } from "@/lib/exportUtils";

type StockReportData = {
  summary: {
    totalProducts: number;
    totalQty: string;
  };
  stock: {
    productId: string;
    sku: string;
    productName: string;
    qty: string;
    breakdownLabel?: string;
    breakdown?: { uomCode: string; qty: number }[];
  }[];
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

export default function StockReport() {
  const [data, setData] = useState<StockReportData | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/stocks", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await apiFetch<{ data: StockReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function getExportRows() {
    if (!data) return [];
    return data.stock.map((row) => [
      row.sku,
      row.productName,
      row.breakdownLabel ?? "-",
      Number(row.qty).toFixed(2),
    ]);
  }

  function handleExportExcel() {
    if (!data) return;
    const headers = ["SKU", "Nama Produk", "Breakdown Satuan", "Qty Base"];
    exportToExcel("Laporan_Stok", headers, getExportRows());
  }

  function handleExportPdf() {
    if (!data) return;
    const headers = ["SKU", "Nama Produk", "Breakdown Satuan", "Qty Base"];
    printTable("Laporan Stok", headers, getExportRows());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Stok</h1>
          <p className="mt-1 text-sm text-zinc-600">Ringkasan saldo stok dan mutasi terbaru.</p>
        </div>
        <div className="flex items-end gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKU / nama produk..."
          />
          <Button variant="secondary" onClick={load}>
            Filter
          </Button>
          <Button variant="secondary" onClick={handleExportPdf} title="Export PDF">
            <Printer className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="secondary" onClick={handleExportExcel} title="Export Excel">
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Produk</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalProducts}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Qty Stok</div>
              <div className="mt-2 text-2xl font-bold">{Number(data.summary.totalQty).toFixed(2)}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Saldo Stok Per Produk
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3">Breakdown Satuan</th>
                      <th className="px-4 py-3 text-right">Qty Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stock.map((row) => (
                      <tr key={row.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.productName}</div>
                          <div className="text-xs text-zinc-500">{row.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.breakdownLabel ?? "-"}</div>
                          {row.breakdown?.length ? (
                            <div className="text-xs text-zinc-500">
                              {row.breakdown.map((b) => `${Number(b.qty.toFixed(2))} ${b.uomCode}`).join(" | ")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">{Number(row.qty).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Mutasi Stok Terbaru
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">Waktu</th>
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latestMovements.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {new Date(row.createdAt).toLocaleDateString("id-ID")}
                          </div>
                          <div className="text-xs text-zinc-500">{row.type}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.productName}</div>
                          <div className="text-xs text-zinc-500">{row.sku}</div>
                        </td>
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
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
