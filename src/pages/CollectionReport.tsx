import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download } from "lucide-react";

type CollectionReportData = {
  summary: {
    totalAmount: string;
    totalTransactions: number;
    cashAmount: string;
    transferAmount: string;
    termAmount: string;
  };
  daily: {
    date: string;
    cash: string;
    transfer: string;
    total: string;
  }[];
  latestPayments: {
    id: string;
    paidAt: string;
    method: string;
    amount: string;
    invoiceNo: string;
    customerName: string;
  }[];
};

export default function CollectionReport() {
  const [data, setData] = useState<CollectionReportData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/collections", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);

      const res = await apiFetch<{ data: CollectionReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const chartData = data?.daily.map(d => ({
    date: d.date.slice(5),
    Cash: Number(d.cash),
    Transfer: Number(d.transfer),
  })).reverse() || [];

  function handleExportCSV() {
    if (!data) return;
    const headers = ["Tanggal", "Pelanggan", "No Invoice", "Metode", "Nominal"];
    const rows = data.latestPayments.map(p => [
      new Date(p.paidAt).toLocaleDateString("id-ID"),
      p.customerName,
      p.invoiceNo,
      p.method,
      p.amount
    ]);
    exportToCSV("Laporan_Penerimaan_Pembayaran", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["Tanggal", "Pelanggan", "No Invoice", "Metode", "Nominal"];
    const rows = data.latestPayments.map(p => [
      new Date(p.paidAt).toLocaleDateString("id-ID"),
      p.customerName,
      p.invoiceNo,
      p.method,
      p.amount
    ]);
    printTable("Laporan Penerimaan Pembayaran", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Penerimaan Pembayaran (Cash-In)</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Monitor uang masuk berdasarkan metode pembayaran.
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
          <Button variant="secondary" onClick={handlePrint} title="Cetak Riwayat">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Uang Masuk</div>
              <div className="mt-2 text-xl font-bold text-emerald-600">Rp {data.summary.totalAmount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Cash</div>
              <div className="mt-2 text-xl font-bold">Rp {data.summary.cashAmount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Transfer</div>
              <div className="mt-2 text-xl font-bold">Rp {data.summary.transferAmount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Transaksi Pembayaran</div>
              <div className="mt-2 text-xl font-bold">{data.summary.totalTransactions} x</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
            <Card className="p-4">
              <div className="mb-4 text-sm font-semibold">Tren Uang Masuk Harian</div>
              {chartData.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis tickFormatter={(val) => `Rp${val/1000}k`} tick={{fontSize: 12}} width={80} />
                      <Tooltip formatter={(value: number) => [`Rp ${value}`, '']} />
                      <Legend />
                      <Bar dataKey="Cash" stackId="a" fill="#10b981" />
                      <Bar dataKey="Transfer" stackId="a" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-zinc-500">
                  Belum ada data penerimaan.
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Penerimaan Terbaru
              </div>
              <div className="overflow-auto h-[300px]">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-2">Tanggal</th>
                      <th className="px-4 py-2">Pelanggan</th>
                      <th className="px-4 py-2 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latestPayments.map((p) => (
                      <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-2">
                          <div className="font-medium">{new Date(p.paidAt).toLocaleDateString("id-ID")}</div>
                          <div className="text-xs text-zinc-500">{p.method}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="truncate w-32">{p.customerName}</div>
                          <div className="text-xs text-zinc-500">{p.invoiceNo}</div>
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-600">Rp {p.amount}</td>
                      </tr>
                    ))}
                    {data.latestPayments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={3}>
                          Belum ada transaksi.
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