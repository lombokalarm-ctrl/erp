import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiDownload, apiFetch, ApiError } from "@/api/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Printer, Download } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/numberFormat";

type SalesReportData = {
  summary: {
    totalTransactions: number;
    totalRevenue: string;
    grossQtyBaseSold: string;
    salesReturnQtyBase: string;
    netQtyBaseSold: string;
  };
  topProducts: {
    productId: string;
    sku: string;
    productName: string;
    qtyBaseSold: string;
    salesReturnQtyBase: string;
    netQtyBaseSold: string;
    revenue: string;
    uomOrder?: string[];
    satuanLabel?: string;
    qty1?: number;
    qty2?: number;
    qty3?: number;
    breakdownLabel?: string;
    breakdown?: { uomCode: string; qty: number }[];
  }[];
  daily: {
    date: string;
    transactions: number;
    revenue: string;
  }[];
};

export default function SalesReport() {
  const [data, setData] = useState<SalesReportData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/sales", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);

      const res = await apiFetch<{ data: SalesReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const chartData = data?.daily.map(d => ({
    date: d.date.slice(5), // MM-DD
    revenue: Number(d.revenue)
  })).reverse() || [];

  async function handleExport(format: "xlsx" | "pdf") {
    try {
      setError(null);
      const url = new URL("/api/v1/exports/sales", window.location.origin);
      url.searchParams.set("format", format);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
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
      setError(e instanceof ApiError ? e.message : "Gagal export laporan penjualan");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Penjualan</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Analisa tren penjualan dan produk terlaris.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Mulai Tanggal</div>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Sampai Tanggal</div>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Omzet Penjualan</div>
              <div className="mt-2 text-2xl font-bold text-emerald-600">{formatCurrency(data.summary.totalRevenue)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Transaksi</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalTransactions} Order</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Net Qty Base Terjual</div>
              <div className="mt-2 text-2xl font-bold">{Number(data.summary.netQtyBaseSold).toFixed(2)}</div>
              <div className="mt-1 text-xs text-zinc-500">
                Gross {Number(data.summary.grossQtyBaseSold).toFixed(2)} - Retur {Number(data.summary.salesReturnQtyBase).toFixed(2)}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-4 text-sm font-semibold">Tren Penjualan (Harian)</div>
              {chartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis tickFormatter={(val) => formatCurrencyCompact(val)} tick={{fontSize: 12}} width={100} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), "Omzet"]} />
                      <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                  Belum ada data penjualan
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                20 Produk Terlaris (Format Satuan)
              </div>
              <div className="h-64 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">Produk</th>
                      <th className="px-4 py-3">Satuan</th>
                      <th className="px-4 py-3 text-right">Qty 1</th>
                      <th className="px-4 py-3 text-right">Qty 2</th>
                      <th className="px-4 py-3 text-right">Qty 3</th>
                      <th className="px-4 py-3">Breakdown Satuan</th>
                      <th className="px-4 py-3 text-right">Gross Qty Base</th>
                      <th className="px-4 py-3 text-right">Retur Qty Base</th>
                      <th className="px-4 py-3 text-right">Net Qty Base</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Omzet</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Harga Rata2/Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.productName}</div>
                          <div className="text-xs text-zinc-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-3">{p.satuanLabel ?? ((p.uomOrder ?? []).slice(0, 3).join(", ") || "-")}</td>
                        <td className="px-4 py-3 text-right">
                          {Number(
                            p.qty1 ?? p.breakdown?.find((b) => b.uomCode === (p.uomOrder ?? [])[0])?.qty ?? 0,
                          ).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(
                            p.qty2 ?? p.breakdown?.find((b) => b.uomCode === (p.uomOrder ?? [])[1])?.qty ?? 0,
                          ).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(
                            p.qty3 ?? p.breakdown?.find((b) => b.uomCode === (p.uomOrder ?? [])[2])?.qty ?? 0,
                          ).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">{p.breakdownLabel ?? "-"}</td>
                        <td className="px-4 py-3 text-right font-medium">{Number(p.qtyBaseSold).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">{Number(p.salesReturnQtyBase).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-medium">{Number(p.netQtyBaseSold).toFixed(2)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">
                          {formatCurrency(p.revenue)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {formatCurrency(
                            Number(p.qtyBaseSold) > 0 ? Number(p.revenue) / Number(p.qtyBaseSold) : 0,
                          )}
                        </td>
                      </tr>
                    ))}
                    {data.topProducts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={11}>
                          Belum ada data produk terjual.
                        </td>
                      </tr>
                    ) : null}
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
