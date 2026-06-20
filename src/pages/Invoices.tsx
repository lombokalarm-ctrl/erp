import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";
import { formatDate } from "@/lib/date";

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount?: string;
  creditedAmount?: string;
  remaining?: string;
  status: string;
};

type InvoiceListResponse = {
  data: InvoiceRow[];
  meta?: {
    total?: number;
  };
};

export default function Invoices() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load(nextPage = page, nextPageSize = pageSize, nextQ = appliedQ) {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
        q: nextQ,
      });
      const res = await apiFetch<InvoiceListResponse>(
        `/api/v1/invoices?${params.toString()}`,
      );
      setItems(res.data);
      setTotal(Number(res.meta?.total ?? 0));
      setPage(nextPage);
      setPageSize(nextPageSize);
      setAppliedQ(nextQ);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const startItem = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = items.length === 0 ? 0 : startItem + items.length - 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 1 && !loading;
  const canGoNext = page < totalPages && !loading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Invoice</h1>
          <p className="mt-1 text-sm text-zinc-600">Lihat faktur, jatuh tempo, dan status pembayaran.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor invoice / pelanggan..." />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              void load(1, pageSize, q);
            }}
          >
            {loading ? "Memuat..." : "Cari"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Invoice</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Jatuh Tempo</th>
                <th className="px-4 py-3">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Total</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Terbayar</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Kredit</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const total = Number(i.totalAmount || 0);
                const paid = Number(i.paidAmount || 0);
                const credited = Number(i.creditedAmount || 0);
                const remaining = Number(i.remaining || 0);
                return (
                  <tr key={i.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">
                    <Link className="text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-500" to={`/invoices/${i.id}`}>
                      {i.invoiceNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{i.customerName}</td>
                  <td className="px-4 py-3">{formatDate(i.invoiceDate)}</td>
                  <td className="px-4 py-3">{formatDate(i.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      i.status === "PAID"
                        ? "bg-emerald-50 text-emerald-700"
                        : i.status === "OVERDUE"
                          ? "bg-red-50 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                    }`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(total)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(paid)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(credited)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{formatCurrency(remaining)}</td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={9}>
                    Belum ada data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="text-zinc-600">
            Menampilkan {startItem}-{endItem} dari {total} invoice
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-zinc-600">
              <span>Baris</span>
              <select
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={pageSize}
                onChange={(e) => {
                  const nextPageSize = Number(e.target.value);
                  void load(1, nextPageSize, appliedQ);
                }}
                disabled={loading}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={!canGoPrev}
                onClick={() => {
                  void load(page - 1, pageSize, appliedQ);
                }}
              >
                Prev
              </Button>
              <span className="min-w-[88px] text-center text-zinc-600">
                Hal {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={!canGoNext}
                onClick={() => {
                  void load(page + 1, pageSize, appliedQ);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

