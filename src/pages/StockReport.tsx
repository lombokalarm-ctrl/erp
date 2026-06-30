import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiDownload, apiFetch, ApiError } from "@/api/client";
import { Download, Printer } from "lucide-react";
import { formatDate } from "@/lib/date";

type SupplierOption = {
  id: string;
  code: string;
  name: string;
};

type StockReportData = {
  suppliers: SupplierOption[];
  summary: {
    totalProducts: number;
    totalQty: string;
  };
  stock: {
    productId: string;
    sku: string;
    productName: string;
    supplierId?: string | null;
    supplierName?: string | null;
    qty: string;
    smallUnitCode?: string | null;
    smallQty?: number;
    largeUnitCode?: string | null;
    largeQty?: number | null;
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
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/stocks", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (supplierId) url.searchParams.set("supplierId", supplierId);
      const res = await apiFetch<{ data: StockReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleExport(format: "xlsx" | "pdf") {
    try {
      setError(null);
      const url = new URL("/api/v1/exports/stocks", window.location.origin);
      url.searchParams.set("format", format);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (supplierId) url.searchParams.set("supplierId", supplierId);
      const file = await apiDownload(url.pathname + url.search);
      const blobUrl = URL.createObjectURL(file.blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal export laporan stok");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Stok</h1>
          <p className="mt-1 text-sm text-zinc-600">Filter per supplier untuk melihat saldo stok produk yang lebih spesifik.</p>
        </div>
        <div className="grid w-full gap-2 md:w-auto md:grid-cols-[240px_240px_auto_auto_auto]">
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
          <Button variant="secondary" onClick={() => void handleExport("pdf")} title="Export PDF">
            <Printer className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="secondary" onClick={() => void handleExport("xlsx")} title="Export Excel">
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
                      <th className="px-4 py-3">Kode Barang</th>
                      <th className="px-4 py-3">Nama Barang</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">Stok Satuan Kecil</th>
                      <th className="px-4 py-3 text-right">Stok Satuan Besar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stock.map((row) => (
                      <tr key={row.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">{row.sku}</td>
                        <td className="px-4 py-3">{row.productName}</td>
                        <td className="px-4 py-3">{row.supplierName ?? "-"}</td>
                        <td className="px-4 py-3 text-right">
                          {Number(row.smallQty ?? row.qty).toFixed(2)} {String(row.smallUnitCode ?? "unit").toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.largeUnitCode
                            ? `${Number(row.largeQty ?? 0).toFixed(2)} ${String(row.largeUnitCode).toUpperCase()}`
                            : "-"}
                        </td>
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
                            {formatDate(row.createdAt)}
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
