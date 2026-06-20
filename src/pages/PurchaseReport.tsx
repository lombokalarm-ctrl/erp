import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { formatCurrency } from "@/lib/numberFormat";
import { formatDate } from "@/lib/date";
import { Download, Printer } from "lucide-react";

type PurchaseReportData = {
  summary: {
    totalPO: number;
    totalPOAmount: string;
    totalGRN: number;
    totalReceivedQty: string;
  };
  bySupplier: {
    supplierCode: string;
    supplierName: string;
    poCount: number;
    poAmount: string;
  }[];
  latestPO: {
    id: string;
    poNo: string;
    orderDate: string;
    status: string;
    totalAmount: string;
    supplierName: string;
  }[];
};

export default function PurchaseReport() {
  const [data, setData] = useState<PurchaseReportData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/purchases", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
      const res = await apiFetch<{ data: PurchaseReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleExportCSV() {
    if (!data) return;
    const headers = ["PO No", "Tanggal", "Supplier", "Status", "Total"];
    const rows = data.latestPO.map((row) => [
      row.poNo,
      row.orderDate,
      row.supplierName,
      row.status,
      row.totalAmount,
    ]);
    exportToCSV("Laporan_Pembelian", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["PO No", "Tanggal", "Supplier", "Status", "Total"];
    const rows = data.latestPO.map((row) => [
      row.poNo,
      row.orderDate,
      row.supplierName,
      row.status,
      formatCurrency(row.totalAmount),
    ]);
    printTable("Laporan Pembelian", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Pembelian</h1>
          <p className="mt-1 text-sm text-zinc-600">Ringkasan PO, GRN, dan pemasok teratas.</p>
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
          <Button variant="secondary" onClick={handlePrint} title="Cetak">
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
              <div className="text-xs font-medium text-zinc-500">Total PO</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalPO}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Nilai PO</div>
              <div className="mt-2 text-2xl font-bold text-emerald-600">
                {formatCurrency(data.summary.totalPOAmount)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total GRN</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalGRN}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Qty Diterima</div>
              <div className="mt-2 text-2xl font-bold">{Number(data.summary.totalReceivedQty).toFixed(2)}</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Pemasok Teratas
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">PO</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySupplier.map((row) => (
                      <tr key={row.supplierCode} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.supplierName}</div>
                          <div className="text-xs text-zinc-500">{row.supplierCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{row.poCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.poAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                PO Terbaru
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">PO</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latestPO.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.poNo}</div>
                          <div className="text-xs text-zinc-500">{formatDate(row.orderDate)} • {row.status}</div>
                        </td>
                        <td className="px-4 py-3">{row.supplierName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.totalAmount)}</td>
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
