import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import { apiFetch } from "@/api/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowRight, AlertTriangle, AlertCircle, ShoppingCart, Users, Wallet, Activity } from "lucide-react";

type DashboardData = {
  kpi: {
    monthlyRevenue: string;
    monthlyCollection: string;
    monthlyOrders: number;
    activeCustomers: number;
  };
  trend: {
    date: string;
    revenue: number;
  }[];
  overdues: {
    id: string;
    invoiceNo: string;
    customerName: string;
    dueDate: string;
    totalAmount: string;
    remaining: string;
  }[];
  criticalStocks: {
    id: string;
    sku: string;
    name: string;
    qty: number;
  }[];
};

function formatRp(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    apiFetch<{ data: DashboardData }>("/api/v1/dashboard/metrics")
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, []);

  const chartData = data?.trend.map(d => ({
    date: d.date.slice(5),
    Omzet: d.revenue
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard Utama</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Ringkasan operasional bisnis dan performa keuangan bulan ini.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Penjualan (Bulan Ini)</div>
              <div className="mt-1 text-2xl font-bold">{data ? formatRp(data.kpi.monthlyRevenue) : "—"}</div>
            </div>
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
              <Activity className="h-5 w-5" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Penerimaan/Cash-in</div>
              <div className="mt-1 text-2xl font-bold">{data ? formatRp(data.kpi.monthlyCollection) : "—"}</div>
            </div>
            <div className="rounded-full bg-blue-100 p-2 text-blue-600">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Total Order (SO)</div>
              <div className="mt-1 text-2xl font-bold">{data?.kpi.monthlyOrders ?? "—"} <span className="text-sm font-normal text-zinc-500">trx</span></div>
            </div>
            <div className="rounded-full bg-orange-100 p-2 text-orange-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Pelanggan Aktif</div>
              <div className="mt-1 text-2xl font-bold">{data?.kpi.activeCustomers ?? "—"} <span className="text-sm font-normal text-zinc-500">toko</span></div>
            </div>
            <div className="rounded-full bg-indigo-100 p-2 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tren Omzet Penjualan (7 Hari Terakhir)</h2>
            <Link to="/sales-report" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              Lihat Detail <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-72 w-full flex-1">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis 
                    tickFormatter={(val) => `Rp${val/1000}k`} 
                    tick={{fontSize: 12, fill: '#6b7280'}} 
                    width={80} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatRp(value), 'Omzet']} 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Omzet" 
                    stroke="#10b981" 
                    strokeWidth={3} 
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                Memuat data grafik...
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="flex flex-col h-[calc(50%-12px)] overflow-hidden">
            <div className="border-b border-zinc-100 bg-red-50/50 px-4 py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-red-700">Piutang Jatuh Tempo (Overdue)</h2>
            </div>
            <div className="overflow-auto flex-1 p-0">
              {data?.overdues.length ? (
                <div className="divide-y divide-zinc-100">
                  {data.overdues.map(inv => (
                    <div key={inv.id} className="p-3 hover:bg-zinc-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <Link to={`/invoices/${inv.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
                          {inv.invoiceNo}
                        </Link>
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                          Sisa: {formatRp(inv.remaining)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600">{inv.customerName}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">Jatuh tempo: <span className="font-medium text-red-600">{inv.dueDate}</span></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-500">
                  Semua tagihan aman / belum ada data.
                </div>
              )}
            </div>
          </Card>

          <Card className="flex flex-col h-[calc(50%-12px)] overflow-hidden">
            <div className="border-b border-zinc-100 bg-orange-50/50 px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-orange-700">Stok Kritis (Batas Minimum)</h2>
            </div>
            <div className="overflow-auto flex-1 p-0">
              {data?.criticalStocks.length ? (
                <div className="divide-y divide-zinc-100">
                  {data.criticalStocks.map(st => (
                    <div key={st.id} className="p-3 hover:bg-zinc-50 transition-colors flex justify-between items-center">
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">{st.name}</div>
                        <div className="text-[10px] text-zinc-500">{st.sku}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded">
                          {st.qty} pcs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-500">
                  Stok barang dalam kondisi aman.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}