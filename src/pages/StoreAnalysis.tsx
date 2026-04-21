import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Customer = { id: string; name: string; code: string };

type Analysis = {
  customer: {
    id: string;
    code: string;
    name: string;
    category: string;
    status: string;
  };
  credit: {
    creditLimit: number;
    paymentTermDays: number;
    outstanding: number;
    remainingLimit: number;
  };
  scores: { score: number; grade: string; calculatedAt: string }[];
  purchaseTrend: { month: string; total: string }[];
};

export default function StoreAnalysis() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canLoad = useMemo(() => !!customerId, [customerId]);

  useEffect(() => {
    apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=200")
      .then((r) => setCustomers(r.data))
      .catch(() => setCustomers([]));
  }, []);

  async function load() {
    if (!customerId) return;
    setError(null);
    try {
      const res = await apiFetch<{ data: Analysis }>(`/api/v1/scoring/store-analysis/${customerId}`);
      setAnalysis(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat analisa");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Analisa Toko</h1>
          <p className="mt-1 text-sm text-zinc-600">Profil toko, limit, sisa limit, tren pembelian, dan skor.</p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm md:w-96"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Pilih toko</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" disabled={!canLoad} onClick={load}>
            Tampilkan
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {analysis ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          <Card className="p-4">
            <div className="text-sm font-semibold">Profil</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Kode</div>
                <div className="mt-1 font-medium">{analysis.customer.code}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Kategori</div>
                <div className="mt-1 font-medium">{analysis.customer.category}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-medium text-zinc-500">Nama</div>
                <div className="mt-1 font-medium">{analysis.customer.name}</div>
              </div>
            </div>

            <div className="mt-6 text-sm font-semibold">Limit & Piutang</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Limit</div>
                <div className="mt-1 font-medium">{analysis.credit.creditLimit}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Sisa Limit</div>
                <div className="mt-1 font-medium">{analysis.credit.remainingLimit}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Piutang Aktif</div>
                <div className="mt-1 font-medium">{analysis.credit.outstanding}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Tempo</div>
                <div className="mt-1 font-medium">{analysis.credit.paymentTermDays} hari</div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Skor</div>
                  <div className="mt-1 text-sm text-zinc-600">Skor terbaru & grade.</div>
                </div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await apiFetch("/api/v1/scoring/recalculate", {
                      method: "POST",
                      body: JSON.stringify({ customerId }),
                    });
                    await load();
                  }}
                >
                  Recalculate
                </Button>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div className="text-3xl font-semibold tracking-tight">{analysis.scores[0]?.score ?? "—"}</div>
                <div className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                  Grade {analysis.scores[0]?.grade ?? "—"}
                </div>
              </div>

              <div className="mt-4 text-xs font-semibold text-zinc-500">Riwayat</div>
              <div className="mt-2 space-y-2">
                {analysis.scores.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <div className="font-medium">{s.score} ({s.grade})</div>
                    <div className="text-xs text-zinc-500">{new Date(s.calculatedAt).toLocaleString("id-ID")}</div>
                  </div>
                ))}
                {analysis.scores.length === 0 ? (
                  <div className="text-sm text-zinc-500">Belum ada skor.</div>
                ) : null}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-sm font-semibold">Trend Pembelian</div>
              <div className="mt-1 text-sm text-zinc-600">Total invoice per bulan (12 bulan terakhir).</div>
              <div className="mt-3 space-y-2">
                {analysis.purchaseTrend.map((t) => (
                  <div key={t.month} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <div className="font-medium">{t.month}</div>
                    <div className="text-zinc-700">{t.total}</div>
                  </div>
                ))}
                {analysis.purchaseTrend.length === 0 ? (
                  <div className="text-sm text-zinc-500">Belum ada transaksi.</div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
