import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatRp(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

type ProfitLossData = {
  summary: {
    grossSales: string;
    totalDiscounts: string;
    netSales: string;
    cogs: string;
    grossProfit: string;
    marginPercentage: string;
  };
  byCategory: {
    categoryName: string;
    netSales: string;
    cogs: string;
    grossProfit: string;
  }[];
  trend: {
    date: string;
    netSales: string;
    cogs: string;
    grossProfit: string;
  }[];
};

export default function ProfitLossReport() {
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/profit-loss", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);

      const res = await apiFetch<{ data: ProfitLossData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan rugi laba");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const chartData = data?.trend.map(d => ({
    date: d.date.slice(5), // MM-DD
    'Laba Kotor': Number(d.grossProfit),
    'Net Sales': Number(d.netSales)
  })).reverse() || [];

  function handleExportCSV() {
    if (!data) return;
    const headers = ["Kategori Produk", "Penjualan Bersih", "HPP (COGS)", "Laba Kotor"];
    const rows = data.byCategory.map(c => [
      c.categoryName,
      c.netSales,
      c.cogs,
      c.grossProfit
    ]);
    exportToCSV("Laporan_Rugi_Laba_Kotor_Per_Kategori", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["Kategori Produk", "Penjualan Bersih", "HPP (COGS)", "Laba Kotor"];
    const rows = data.byCategory.map(c => [
      c.categoryName,
      c.netSales,
      c.cogs,
      c.grossProfit
    ]);
    printTable("Laporan Laba Kotor per Kategori", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Rugi Laba (Laba Kotor)</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Analisa Pendapatan, HPP, dan Laba Kotor berdasarkan transaksi penjualan.
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
          <Button variant="secondary" onClick={handlePrint} title="Cetak Laporan Kategori">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={handleExportCSV} title="Export CSV Kategori">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 bg-zinc-50">
              <div className="text-xs font-medium text-zinc-500">Penjualan Kotor</div>
              <div className="mt-2 text-xl font-semibold">{formatRp(data.summary.grossSales)}</div>
            </Card>
            <Card className="p-4 bg-red-50/50">
              <div className="text-xs font-medium text-red-600">Total Potongan/Diskon</div>
              <div className="mt-2 text-xl font-semibold text-red-700">- {formatRp(data.summary.totalDiscounts)}</div>
            </Card>
            <Card className="p-4 bg-emerald-50/50">
              <div className="text-xs font-medium text-emerald-600">Penjualan Bersih (Net Sales)</div>
              <div className="mt-2 text-xl font-bold text-emerald-700">{formatRp(data.summary.netSales)}</div>
            </Card>
            <Card className="p-4 bg-orange-50/50">
              <div className="text-xs font-medium text-orange-600">Harga Pokok Penjualan (HPP)</div>
              <div className="mt-2 text-xl font-semibold text-orange-700">- {formatRp(data.summary.cogs)}</div>
            </Card>
          </div>

          <Card className="p-6 bg-emerald-600 text-white shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <div className="text-sm font-medium text-emerald-100">Laba Kotor (Gross Profit)</div>
                <div className="text-4xl font-bold mt-1">{formatRp(data.summary.grossProfit)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-emerald-100">Margin Laba Kotor</div>
                <div className="text-4xl font-bold mt-1">{data.summary.marginPercentage}%</div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-4 text-sm font-semibold">Tren Laba Kotor Harian</div>
              {chartData.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis tickFormatter={(val) => `Rp${val/1000}k`} tick={{fontSize: 12}} width={80} />
                      <Tooltip formatter={(value: number) => [formatRp(value), '']} />
                      <Line type="monotone" dataKey="Laba Kotor" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="Net Sales" stroke="#9ca3af" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                  Belum ada data
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Laba Kotor per Kategori Produk
              </div>
              <div className="overflow-auto h-64">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-2">Kategori</th>
                      <th className="px-4 py-2 text-right">Net Sales</th>
                      <th className="px-4 py-2 text-right">HPP</th>
                      <th className="px-4 py-2 text-right">Laba Kotor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((c, idx) => (
                      <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-2 font-medium">{c.categoryName}</td>
                        <td className="px-4 py-2 text-right">{formatRp(c.netSales)}</td>
                        <td className="px-4 py-2 text-right text-orange-600">{formatRp(c.cogs)}</td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-600">{formatRp(c.grossProfit)}</td>
                      </tr>
                    ))}
                    {data.byCategory.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={4}>
                          Belum ada penjualan.
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