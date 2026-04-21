import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download, RotateCcw } from "lucide-react";

type ReturnReportData = {
  summary: {
    totalReturns: number;
    totalSalesReturns: number;
    totalPurchaseReturns: number;
    totalItemsReturned: number;
  };
  details: {
    returnNo: string;
    type: string;
    returnDate: string;
    referenceNo: string;
    partnerName: string;
    sku: string;
    productName: string;
    qty: number;
    reason: string;
    createdBy: string;
  }[];
};

export default function ReturnReport() {
  const [data, setData] = useState<ReturnReportData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/returns", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
      if (typeFilter) url.searchParams.set("type", typeFilter);

      const res = await apiFetch<{ data: ReturnReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan retur");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleExportCSV() {
    if (!data) return;
    const headers = ["No Retur", "Tipe", "Tanggal", "Partner", "Ref", "SKU", "Barang", "Qty", "Alasan"];
    const rows = data.details.map(d => [
      d.returnNo,
      d.type === 'SALES_RETURN' ? 'Dari Pelanggan' : 'Ke Supplier',
      d.returnDate,
      d.partnerName,
      d.referenceNo || '-',
      d.sku,
      d.productName,
      d.qty,
      d.reason || '-'
    ]);
    exportToCSV("Laporan_Barang_Retur", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["No Retur", "Tipe", "Tanggal", "Partner", "Barang", "Qty", "Alasan"];
    const rows = data.details.map(d => [
      d.returnNo,
      d.type === 'SALES_RETURN' ? 'Dari Pelanggan' : 'Ke Supplier',
      d.returnDate,
      d.partnerName,
      `${d.productName} (${d.sku})`,
      d.qty,
      d.reason || '-'
    ]);
    printTable("Laporan Retur Barang", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-zinc-600" />
            Laporan Barang Retur
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Riwayat lengkap pengembalian barang beserta alasan dan mutasi stoknya.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Tipe Retur</div>
            <select
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Semua Tipe</option>
              <option value="SALES_RETURN">Dari Pelanggan</option>
              <option value="PURCHASE_RETURN">Ke Supplier</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Mulai</div>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Sampai</div>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={load}>
            Filter
          </Button>
          <Button variant="secondary" onClick={handlePrint} title="Cetak Laporan">
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
            <Card className="p-4 bg-zinc-50">
              <div className="text-xs font-medium text-zinc-500">Total Tiket Retur</div>
              <div className="mt-2 text-2xl font-semibold">{data.summary.totalReturns} <span className="text-sm font-normal text-zinc-500">tiket</span></div>
            </Card>
            <Card className="p-4 border-l-4 border-l-orange-500">
              <div className="text-xs font-medium text-orange-600">Dari Pelanggan (Sales Return)</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalSalesReturns} <span className="text-sm font-normal text-zinc-500">tiket</span></div>
            </Card>
            <Card className="p-4 border-l-4 border-l-emerald-500">
              <div className="text-xs font-medium text-emerald-600">Ke Supplier (Purchase Return)</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.totalPurchaseReturns} <span className="text-sm font-normal text-zinc-500">tiket</span></div>
            </Card>
            <Card className="p-4 bg-indigo-50/50">
              <div className="text-xs font-medium text-indigo-600">Total Qty Barang Retur</div>
              <div className="mt-2 text-2xl font-bold text-indigo-700">{data.summary.totalItemsReturned} <span className="text-sm font-normal text-indigo-400">pcs</span></div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
              Rincian Barang Retur
            </div>
            <div className="overflow-auto max-h-[500px]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-3">Tanggal / No Retur</th>
                    <th className="px-4 py-3">Tipe / Partner</th>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.details.map((d, idx) => (
                    <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-indigo-600">{d.returnNo}</div>
                        <div className="text-xs text-zinc-500">{d.returnDate}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.type === 'SALES_RETURN' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {d.type === 'SALES_RETURN' ? 'IN (Cust)' : 'OUT (Supp)'}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-700 max-w-[150px] truncate" title={d.partnerName}>
                          {d.partnerName}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{d.productName}</div>
                        <div className="text-xs text-zinc-500">{d.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-700">
                        {d.qty}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-zinc-600 max-w-[200px] break-words">
                          {d.reason || '-'}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">Ref: {d.referenceNo || '-'}</div>
                      </td>
                    </tr>
                  ))}
                  {data.details.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-zinc-500" colSpan={5}>
                        Tidak ada data retur yang sesuai filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}