import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download } from "lucide-react";

type SalesPerformanceRow = {
  salesId: string;
  salesName: string;
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: string;
};

export default function SalesPerformance() {
  const [items, setItems] = useState<SalesPerformanceRow[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/sales-performance", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);

      const res = await apiFetch<{ data: SalesPerformanceRow[] }>(url.pathname + url.search);
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleExportCSV() {
    const headers = ["Nama Sales", "Pelanggan Aktif", "Jumlah Order", "Total Penjualan (Omzet)"];
    const rows = items.map(row => [
      row.salesName,
      row.totalCustomers,
      row.totalOrders,
      row.totalRevenue
    ]);
    exportToCSV("Kinerja_Sales", headers, rows);
  }

  function handlePrint() {
    const headers = ["Nama Sales", "Pelanggan Aktif", "Jumlah Order", "Total Penjualan (Omzet)"];
    const rows = items.map(row => [
      row.salesName,
      row.totalCustomers,
      row.totalOrders,
      row.totalRevenue
    ]);
    printTable("Laporan Kinerja Sales", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Kinerja Sales</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Analisa pencapaian jumlah pelanggan, order, dan omzet per akun Sales.
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
          <Button variant="secondary" onClick={handlePrint} title="Cetak Laporan">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={handleExportCSV} title="Export CSV (Excel)">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
          Rekapitulasi Sales
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">Nama Sales</th>
                <th className="px-4 py-2 text-right">Pelanggan Aktif</th>
                <th className="px-4 py-2 text-right">Jumlah Order</th>
                <th className="px-4 py-2 text-right">Total Penjualan (Omzet)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.salesId} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{row.salesName}</td>
                  <td className="px-4 py-2 text-right">{row.totalCustomers} Toko</td>
                  <td className="px-4 py-2 text-right">{row.totalOrders} Transaksi</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-600">Rp {row.totalRevenue}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={4}>
                    Belum ada data kinerja sales.
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
