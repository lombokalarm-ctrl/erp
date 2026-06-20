import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiDownload, apiFetch, ApiError } from "@/api/client";
import { Printer, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatCurrencyCompact } from "@/lib/numberFormat";
import { formatDate } from "@/lib/date";

type ProfitLossData = {
  summary: {
    grossSales: string;
    totalDiscounts: string;
    salesReturnAmount: string;
    netSales: string;
    cogs: string;
    hppSales: string;
    hppReturn: string;
    hppNet: string;
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
  topProducts: {
    productId: string;
    sku: string;
    productName: string;
    grossQtyBaseSold: string;
    returnQtyBase: string;
    netQtyBaseSold: string;
    netSales: string;
    cogs: string;
    grossProfit: string;
  }[];
  purchaseInvoice?: {
    summary: {
      invoiceCount: number;
      itemCount: number;
      qtyBaseTotal: string;
      grossAmount: string;
      discountAmount: string;
      netAmount: string;
    };
    bySupplier: {
      supplierId: string;
      supplierName: string;
      invoiceCount: number;
      qtyBaseTotal: string;
      grossAmount: string;
      discountAmount: string;
      netAmount: string;
    }[];
    byProduct: {
      productId: string;
      sku: string;
      productName: string;
      qtyBaseTotal: string;
      grossAmount: string;
      discountAmount: string;
      netAmount: string;
    }[];
  };
};

export default function ProfitLossReport() {
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"sales" | "purchase">("sales");

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
    date: formatDate(d.date),
    'Laba Kotor': Number(d.grossProfit),
    'Net Sales': Number(d.netSales)
  })).reverse() || [];

  const num2 = (value: string | number) => Math.round(Number(value) * 100) / 100;

  function buildInterpretation(current: ProfitLossData) {
    const margin = Number(current.summary.marginPercentage);
    const sortedByProfit = [...current.topProducts].sort(
      (a, b) => Number(b.grossProfit) - Number(a.grossProfit),
    );
    const topProfit = sortedByProfit.find((p) => Number(p.grossProfit) > 0) || null;
    const topLoss = [...current.topProducts]
      .sort((a, b) => Number(a.grossProfit) - Number(b.grossProfit))
      .find((p) => Number(p.grossProfit) < 0) || null;

    let marginStatus = "Sehat";
    if (margin < 0) marginStatus = "Negatif";
    else if (margin < 10) marginStatus = "Tipis";
    else if (margin < 20) marginStatus = "Waspada";

    const notes: string[] = [];
    if (Number(current.summary.salesReturnAmount) > 0) {
      notes.push("Retur penjualan aktif dan mengurangi penjualan bersih.");
    }
    if (Number(current.summary.hppReturn) > 0) {
      notes.push("HPP retur sudah mengoreksi HPP bersih (HPP Net).");
    }
    if (margin < 0) {
      notes.push("Margin negatif: evaluasi harga jual, diskon, dan biaya pokok.");
    } else if (margin < 10) {
      notes.push("Margin tipis: monitor SKU rugi dan efisiensi diskon.");
    } else {
      notes.push("Margin masih aman, lanjutkan pemantauan SKU loss maker.");
    }

    return { marginStatus, topProfit, topLoss, notes };
  }

  async function handleExport(format: "xlsx" | "pdf") {
    try {
      setError(null);
      const url = new URL("/api/v1/exports/profit-loss", window.location.origin);
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
      setError(e instanceof ApiError ? e.message : "Gagal export laporan rugi laba");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Rugi Laba (Laba Kotor)</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {mode === "sales"
              ? "Analisa Pendapatan, HPP, dan Laba Kotor berdasarkan transaksi penjualan."
              : "Analisa pembelian berdasarkan faktur pabrik (harga dasar, diskon, dan nilai bersih pembelian)."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-1">
            <Button variant={mode === "sales" ? "primary" : "secondary"} onClick={() => setMode("sales")}>
              Penjualan
            </Button>
            <Button variant={mode === "purchase" ? "primary" : "secondary"} onClick={() => setMode("purchase")}>
              Pembelian (Faktur)
            </Button>
          </div>
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
          {mode === "sales" ? (
            <>
              <Button variant="secondary" onClick={() => void handleExport("pdf")} title="Export PDF">
                <Printer className="h-4 w-4" />
              </Button>
              <Button variant="secondary" onClick={() => void handleExport("xlsx")} title="Export Excel Analitik">
                <Download className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {data && (
        mode === "sales" ? (
        <>
          {(() => {
            const interpretation = buildInterpretation(data);
            return (
              <Card className="p-4">
                <div className="mb-3 text-sm font-semibold">Interpretasi Otomatis</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Status Margin</div>
                    <div className="mt-1 text-sm font-semibold">{interpretation.marginStatus}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs text-emerald-700">Top Profit Driver</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-700">
                      {interpretation.topProfit
                        ? `${interpretation.topProfit.sku} (${formatCurrency(interpretation.topProfit.grossProfit)})`
                        : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-xs text-red-700">Top Loss Driver</div>
                    <div className="mt-1 text-sm font-semibold text-red-700">
                      {interpretation.topLoss
                        ? `${interpretation.topLoss.sku} (${formatCurrency(interpretation.topLoss.grossProfit)})`
                        : "-"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-zinc-600">
                  {interpretation.notes.map((note, idx) => (
                    <div key={idx}>- {note}</div>
                  ))}
                </div>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="p-4 bg-zinc-50">
              <div className="text-xs font-medium text-zinc-500">Penjualan Kotor</div>
              <div className="mt-2 text-xl font-semibold">{formatCurrency(data.summary.grossSales)}</div>
            </Card>
            <Card className="p-4 bg-red-50/50">
              <div className="text-xs font-medium text-red-600">Total Potongan/Diskon</div>
              <div className="mt-2 text-xl font-semibold text-red-700">- {formatCurrency(data.summary.totalDiscounts)}</div>
            </Card>
            <Card className="p-4 bg-amber-50/60">
              <div className="text-xs font-medium text-amber-700">Retur Penjualan (Net)</div>
              <div className="mt-2 text-xl font-semibold text-amber-700">- {formatCurrency(data.summary.salesReturnAmount)}</div>
            </Card>
            <Card className="p-4 bg-emerald-50/50">
              <div className="text-xs font-medium text-emerald-600">Penjualan Bersih (Setelah Retur)</div>
              <div className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(data.summary.netSales)}</div>
            </Card>
            <Card className="p-4 bg-orange-50/50">
              <div className="text-xs font-medium text-orange-600">Harga Pokok Penjualan (HPP Net)</div>
              <div className="mt-2 text-xl font-semibold text-orange-700">- {formatCurrency(data.summary.hppNet)}</div>
              <div className="mt-1 text-xs text-orange-700">
                Sales {formatCurrency(data.summary.hppSales)} - Retur {formatCurrency(data.summary.hppReturn)}
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-emerald-600 text-white shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <div className="text-sm font-medium text-emerald-100">Laba Kotor (Gross Profit)</div>
                <div className="text-4xl font-bold mt-1">{formatCurrency(data.summary.grossProfit)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-emerald-100">Margin Laba Kotor</div>
                <div className="text-4xl font-bold mt-1">{data.summary.marginPercentage}%</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Waterfall Laba Kotor</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-lg border border-zinc-200 p-3">
                <div className="text-xs text-zinc-500">Gross Sales</div>
                <div className="mt-1 text-sm font-semibold">{formatCurrency(data.summary.grossSales)}</div>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-xs text-red-700">Diskon</div>
                <div className="mt-1 text-sm font-semibold text-red-700">- {formatCurrency(data.summary.totalDiscounts)}</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs text-amber-700">Retur (Net)</div>
                <div className="mt-1 text-sm font-semibold text-amber-700">- {formatCurrency(data.summary.salesReturnAmount)}</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs text-emerald-700">Net Sales</div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">{formatCurrency(data.summary.netSales)}</div>
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <div className="text-xs text-orange-700">HPP Net</div>
                <div className="mt-1 text-sm font-semibold text-orange-700">- {formatCurrency(data.summary.hppNet)}</div>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-700">Gross Profit</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{formatCurrency(data.summary.grossProfit)}</div>
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
                      <YAxis tickFormatter={(val) => formatCurrencyCompact(val)} tick={{fontSize: 12}} width={100} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), ""]} />
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
                      <th className="px-4 py-3">Kategori</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Net Sales</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">HPP Net</th>
                      <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Laba Kotor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((c, idx) => (
                      <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">{c.categoryName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(c.netSales)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-orange-600">{formatCurrency(c.cogs)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(c.grossProfit)}</td>
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

          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
              Top Kontributor Laba Kotor per SKU
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3 text-right">Gross Qty Base</th>
                    <th className="px-4 py-3 text-right">Retur Qty Base</th>
                    <th className="px-4 py-3 text-right">Net Qty Base</th>
                    <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Net Sales</th>
                    <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">HPP Net</th>
                    <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.productName}</div>
                        <div className="text-xs text-zinc-500">{p.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{Number(p.grossQtyBaseSold).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{Number(p.returnQtyBase).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{Number(p.netQtyBaseSold).toFixed(2)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(p.netSales)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(p.cogs)}</td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                          Number(p.grossProfit) < 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {formatCurrency(p.grossProfit)}
                      </td>
                    </tr>
                  ))}
                  {data.topProducts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={7}>
                        Belum ada data SKU.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4 bg-zinc-50">
                <div className="text-xs font-medium text-zinc-500">Pembelian Bruto</div>
                <div className="mt-2 text-xl font-semibold">
                  {formatCurrency(data.purchaseInvoice?.summary.grossAmount ?? "0")}
                </div>
              </Card>
              <Card className="p-4 bg-red-50/50">
                <div className="text-xs font-medium text-red-600">Diskon Pabrik</div>
                <div className="mt-2 text-xl font-semibold text-red-700">
                  - {formatCurrency(data.purchaseInvoice?.summary.discountAmount ?? "0")}
                </div>
              </Card>
              <Card className="p-4 bg-emerald-50/50">
                <div className="text-xs font-medium text-emerald-600">Pembelian Bersih</div>
                <div className="mt-2 text-xl font-semibold text-emerald-700">
                  {formatCurrency(data.purchaseInvoice?.summary.netAmount ?? "0")}
                </div>
              </Card>
              <Card className="p-4 bg-sky-50/50">
                <div className="text-xs font-medium text-sky-700">Jumlah Faktur</div>
                <div className="mt-2 text-xl font-semibold text-sky-700">{data.purchaseInvoice?.summary.invoiceCount ?? 0}</div>
                <div className="mt-1 text-xs text-sky-700/80">Item: {data.purchaseInvoice?.summary.itemCount ?? 0}</div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                  Pembelian Bersih per Supplier
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3 text-right">Faktur</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Bruto</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Diskon</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Bersih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.purchaseInvoice?.bySupplier ?? []).map((s) => (
                        <tr key={s.supplierId} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-4 py-3 font-medium">{s.supplierName}</td>
                          <td className="px-4 py-3 text-right">{s.invoiceCount}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(s.grossAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">- {formatCurrency(s.discountAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(s.netAmount)}</td>
                        </tr>
                      ))}
                      {(data.purchaseInvoice?.bySupplier ?? []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={5}>
                            Belum ada faktur pembelian (POSTED) pada periode ini.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                  Pembelian Bersih per Produk (Top 50)
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                        <th className="px-4 py-3">Produk</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Bruto</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Diskon</th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Bersih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.purchaseInvoice?.byProduct ?? []).map((p) => (
                        <tr key={p.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.productName}</div>
                            <div className="text-xs text-zinc-500">{p.sku}</div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(p.grossAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">- {formatCurrency(p.discountAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(p.netAmount)}</td>
                        </tr>
                      ))}
                      {(data.purchaseInvoice?.byProduct ?? []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={4}>
                            Belum ada data.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )
      )}
    </div>
  );
}
