import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download } from "lucide-react";

type SalesReportData = {
  summary: {
    totalTransactions: number;
    totalRevenue: string;
  };
  topProducts: {
    sku: string;
    productName: string;
    qtySold: number;
    revenue: string;
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

  function handleExportCSV() {
    if (!data) return;
    const headers = ["Nama Barang", "SKU", "Qty Terjual", "Omzet"];
    const rows = data.topProducts.map(p => [
      p.productName,
      p.sku,
      p.qtySold,
      p.revenue
    ]);
    exportToCSV("Laporan_Produk_Terlaris", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["Nama Barang", "SKU", "Qty Terjual", "Omzet"];
    const rows = data.topProducts.map(p => [
      p.productName,
      p.sku,
      p.qtySold,
      p.revenue
    ]);
    printTable("Laporan Produk Terlaris", headers, rows);
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
          <Button variant="secondary" onClick={handlePrint} title="Cetak Produk Terlaris">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={handleExportCSV} title="Export CSV">
            <Download className="h-4 w-4" />
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
              <div className="text-xs font-medium text-zinc-500">Total Omzet Penjualan</div>
              <div className="mt-2 text-2xl font-bold text-emerald-600">Rp {data.summary.totalRevenue}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Transaksi</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalTransactions} Order</div>
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
                      <YAxis tickFormatter={(val) => `Rp${val/1000}k`} tick={{fontSize: 12}} width={80} />
                      <Tooltip formatter={(value: number) => [`Rp ${value}`, 'Omzet']} />
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
                20 Produk Terlaris
              </div>
              <div className="overflow-auto h-64">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-2">Nama Barang</th>
                      <th className="px-4 py-2 text-right">Qty Terjual</th>
                      <th className="px-4 py-2 text-right">Omzet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.sku} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.productName}</div>
                          <div className="text-xs text-zinc-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-2 text-right">{p.qtySold}</td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-600">Rp {p.revenue}</td>
                      </tr>
                    ))}
                    {data.topProducts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={3}>
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
