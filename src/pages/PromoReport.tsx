import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Printer, Download } from "lucide-react";

type PromoReportData = {
  summary: {
    totalDiscountGiven: string;
    invoicesWithDiscount: number;
  };
  discountedProducts: {
    sku: string;
    productName: string;
    qtySold: number;
    totalDiscount: string;
    revenueAfterDiscount: string;
  }[];
  activePromos: {
    promoName: string;
    productName: string;
    productSku: string;
    promoType: string;
    discountValue: number;
    minQty: number;
    startDate: string | null;
    endDate: string | null;
  }[];
};

export default function PromoReport() {
  const [data, setData] = useState<PromoReportData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const url = new URL("/api/v1/reports/promos", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);

      const res = await apiFetch<{ data: PromoReportData }>(url.pathname + url.search);
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleExportCSV() {
    if (!data) return;
    const headers = ["Nama Barang", "SKU", "Qty Terjual (Berdiskon)", "Total Diskon Diberikan", "Omzet Setelah Diskon"];
    const rows = data.discountedProducts.map(p => [
      p.productName,
      p.sku,
      p.qtySold,
      p.totalDiscount,
      p.revenueAfterDiscount
    ]);
    exportToCSV("Laporan_Promo_Diskon_Produk", headers, rows);
  }

  function handlePrint() {
    if (!data) return;
    const headers = ["Nama Barang", "SKU", "Qty Terjual", "Total Diskon", "Omzet Akhir"];
    const rows = data.discountedProducts.map(p => [
      p.productName,
      p.sku,
      p.qtySold,
      p.totalDiscount,
      p.revenueAfterDiscount
    ]);
    printTable("Laporan Evaluasi Promo & Diskon", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Promo & Diskon</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Evaluasi total diskon yang diberikan dan performa promo produk.
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Total Biaya Diskon Diberikan</div>
              <div className="mt-2 text-2xl font-bold text-red-600">Rp {data.summary.totalDiscountGiven}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-zinc-500">Jumlah Invoice dengan Diskon</div>
              <div className="mt-2 text-2xl font-bold">{data.summary.invoicesWithDiscount} Invoice</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Produk Paling Banyak Mendapat Diskon
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-3">Nama Barang</th>
                      <th className="px-4 py-3 text-right">Qty Terjual</th>
                      <th className="px-4 py-3 text-right text-red-600">Total Diskon Diberikan</th>
                      <th className="px-4 py-3 text-right text-emerald-600">Omzet Setelah Diskon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.discountedProducts.map((p) => (
                      <tr key={p.sku} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.productName}</div>
                          <div className="text-xs text-zinc-500">{p.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{p.qtySold}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">Rp {p.totalDiscount}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">Rp {p.revenueAfterDiscount}</td>
                      </tr>
                    ))}
                    {data.discountedProducts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={4}>
                          Tidak ada data diskon pada periode ini.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Promo & Diskon Sedang Aktif
              </div>
              <div className="overflow-auto max-h-[400px] p-3 space-y-3">
                {data.activePromos.map((ap, idx) => (
                  <div key={idx} className="rounded-lg border border-zinc-100 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm text-indigo-700">{ap.promoName}</div>
                        <div className="text-xs text-zinc-600 mt-1">{ap.productName} ({ap.productSku})</div>
                      </div>
                      <div className="rounded bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
                        {ap.promoType === 'PERCENTAGE' ? `${ap.discountValue}%` : `Rp ${ap.discountValue}`}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500">
                      <div>Min Qty: <span className="font-medium text-zinc-700">{ap.minQty}</span></div>
                      <div>
                        {ap.startDate ? new Date(ap.startDate).toLocaleDateString('id-ID') : '∞'} 
                        {' - '} 
                        {ap.endDate ? new Date(ap.endDate).toLocaleDateString('id-ID') : '∞'}
                      </div>
                    </div>
                  </div>
                ))}
                {data.activePromos.length === 0 ? (
                  <div className="py-6 text-center text-sm text-zinc-500">
                    Tidak ada promo aktif.
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}