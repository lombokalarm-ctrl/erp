import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { ApiError, apiFetch } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";

type CreditNoteRow = {
  id: string;
  creditNo: string;
  creditDate: string;
  customerName: string;
  status: string;
  totalAmount: string;
  appliedAmount: string;
  remainingAmount: string;
  invoiceNo?: string;
  returnNo?: string;
};

type CreditNoteDetail = CreditNoteRow & {
  reason?: string;
  notes?: string;
  items: Array<{
    id: string;
    sku: string;
    productName: string;
    qty: string;
    uom: string;
    unitPrice: string;
    discountAmount: string;
    lineTotal: string;
    reason?: string;
  }>;
  applies: Array<{
    id: string;
    applyDate: string;
    amount: string;
    invoiceId: string;
    invoiceNo: string;
  }>;
};

export default function CreditNotes() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CreditNoteRow[]>([]);
  const [selected, setSelected] = useState<CreditNoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: CreditNoteRow[] }>(
        "/api/v1/credit-notes?page=1&pageSize=100&q=" + encodeURIComponent(q),
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat note kredit");
    }
  }

  async function openDetail(id: string) {
    try {
      const res = await apiFetch<{ data: CreditNoteDetail }>(`/api/v1/credit-notes/${id}`);
      setSelected(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat detail note kredit");
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Note Kredit</h1>
          <p className="mt-1 text-sm text-zinc-600">Riwayat kredit dari retur penjualan dan alokasi ke invoice.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor note kredit..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Note Kredit</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Total</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Applied</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cn) => (
                <tr key={cn.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{cn.creditNo}</td>
                  <td className="px-4 py-3">{cn.creditDate}</td>
                  <td className="px-4 py-3">{cn.customerName}</td>
                  <td className="px-4 py-3">{cn.status}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(cn.totalAmount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(cn.appliedAmount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(cn.remainingAmount)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => openDetail(cn.id)}>
                      Detail
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={8}>
                    Belum ada data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-5xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{selected.creditNo}</div>
                <div className="text-xs text-zinc-500">{selected.customerName}</div>
              </div>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Tutup
              </Button>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>Total: <strong className="whitespace-nowrap">{formatCurrency(selected.totalAmount)}</strong></div>
              <div>Applied: <strong className="whitespace-nowrap">{formatCurrency(selected.appliedAmount)}</strong></div>
              <div>Remaining: <strong className="whitespace-nowrap">{formatCurrency(selected.remainingAmount)}</strong></div>
              <div>Status: <strong>{selected.status}</strong></div>
              <div>Invoice: <strong>{selected.invoiceNo || "-"}</strong></div>
              <div>Retur: <strong>{selected.returnNo || "-"}</strong></div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                Item Note Kredit
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Produk</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Harga</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Diskon</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-100">
                      <td className="px-3 py-2">{it.sku}</td>
                      <td className="px-3 py-2">{it.productName}</td>
                      <td className="px-3 py-2">{it.qty} {it.uom}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(it.unitPrice)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(it.discountAmount)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                Riwayat Alokasi
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-3 py-2">Tanggal</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.applies.map((ap) => (
                    <tr key={ap.id} className="border-b border-zinc-100">
                      <td className="px-3 py-2">{new Date(ap.applyDate).toLocaleString("id-ID")}</td>
                      <td className="px-3 py-2">{ap.invoiceNo}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(ap.amount)}</td>
                    </tr>
                  ))}
                  {selected.applies.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-zinc-500" colSpan={3}>
                        Belum ada alokasi.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
