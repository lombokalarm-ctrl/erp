import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";

type Invoice = { id: string; invoiceNo: string; customerName: string; totalAmount: string; status: string };
type InvoiceDetail = Invoice & { paid: string; remaining: string; customerName: string; customerCode: string };

function normalizePaymentAmount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const rounded = Math.max(0, Math.round(numeric));
  return String(rounded);
}

export default function Payments() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "TERM">("CASH");
  const [amount, setAmount] = useState("0");
  const [paidAt, setPaidAt] = useState(new Date().toISOString());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const remainingNumber = invoiceDetail ? Number(invoiceDetail.remaining) : null;
  const amountNumber = Number(amount);
  const amountError =
    invoiceDetail && Number.isFinite(amountNumber) && amountNumber > Number(invoiceDetail.remaining)
      ? `Nominal melebihi sisa tagihan (sisa: ${invoiceDetail.remaining})`
      : null;

  const canSubmit = useMemo(
    () => invoiceId && Number(amount) > 0 && paidAt && !amountError,
    [invoiceId, amount, paidAt, amountError],
  );
  const invoiceOptions = useMemo(
    () =>
      invoices.map((invoice) => ({
        value: invoice.id,
        label: `${invoice.invoiceNo} | ${invoice.customerName} | ${invoice.status} | ${formatCurrency(invoice.totalAmount)}`,
      })),
    [invoices],
  );

  useEffect(() => {
    apiFetch<{ data: Invoice[] }>("/api/v1/invoices?page=1&pageSize=100")
      .then((r) => setInvoices(r.data))
      .catch(() => setInvoices([]));
  }, []);

  useEffect(() => {
    if (!invoiceId) {
      setInvoiceDetail(null);
      return;
    }

    let cancelled = false;
    setError(null);
    apiFetch<{ data: InvoiceDetail }>(`/api/v1/invoices/${invoiceId}/detail`)
      .then((r) => {
        if (cancelled) return;
        setInvoiceDetail(r.data);
        setAmount(normalizePaymentAmount(r.data.remaining));
      })
      .catch((e) => {
        if (cancelled) return;
        setInvoiceDetail(null);
        setError(e instanceof ApiError ? e.message : "Gagal memuat detail invoice");
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Pembayaran</h1>
        <p className="mt-1 text-sm text-zinc-600">Catat pembayaran invoice (tunai/transfer/tempo) termasuk cicilan.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Daftar Invoice</span>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setInvoiceId("");
              setInvoiceDetail(null);
              setMethod("CASH");
              setAmount("0");
              setPaidAt(new Date().toISOString());
              setNote("");
              setFile(null);
              setIsFormOpen(true);
            }}
          >
            Input Pembayaran
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">Invoice</th>
                <th className="px-4 py-2">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{i.invoiceNo}</td>
                  <td className="px-4 py-2">{i.status}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatCurrency(i.totalAmount)}</td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={3}>
                    Belum ada data invoice.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Input Pembayaran</div>
                <p className="text-xs text-zinc-500">Pilih invoice, masukkan nominal, lalu simpan transaksi bayar.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsFormOpen(false)}
              >
                Tutup
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-1 text-xs font-medium text-zinc-600">Invoice</div>
                <SearchableSelect
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="Pilih invoice"
                  searchPlaceholder="Cari nomor invoice / pelanggan..."
                  options={invoiceOptions}
                />
              </label>

              {invoiceDetail ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm md:col-span-2">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="font-medium">
                      {invoiceDetail.customerCode} - {invoiceDetail.customerName}
                    </div>
                    <div className="text-xs text-zinc-500">{invoiceDetail.invoiceNo}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-zinc-700 sm:grid-cols-3">
                    <div>
                      <div className="text-zinc-500">Total Invoice</div>
                      <div className="font-semibold whitespace-nowrap">{formatCurrency(invoiceDetail.totalAmount)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Sudah Dibayar</div>
                      <div className="font-semibold whitespace-nowrap">{formatCurrency(invoiceDetail.paid)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Sisa Tagihan</div>
                      <div className="font-semibold whitespace-nowrap text-emerald-700">{formatCurrency(invoiceDetail.remaining)}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Metode</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as "CASH" | "TRANSFER" | "TERM")}
                >
                  <option value="CASH">Cash</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="TERM">Tempo</option>
                </select>
              </label>

              <NumericInput
                label="Nominal"
                mode="currency"
                value={amount}
                onValueChange={(v) => setAmount(v || "0")}
                error={amountError}
              />

              <Input label="Tanggal Bayar (ISO)" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />

              <label className="block md:col-span-2">
                <div className="mb-1 text-xs font-medium text-zinc-600">Bukti Transfer (opsional)</div>
                <input
                  className="block w-full text-sm"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsFormOpen(false)} disabled={saving}>
                  Batal
                </Button>
                <Button
                  disabled={!canSubmit || saving}
                  onClick={async () => {
                    setSaving(true);
                    setError(null);
                    try {
                      const res = await apiFetch<{ data: { payment: { id: string } } }>(
                        "/api/v1/payments",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            invoiceId,
                            method,
                            amount: Number(amount),
                            paidAt,
                            note: note || undefined,
                          }),
                        },
                      );

                      const paymentId = res.data.payment.id;
                      if (file) {
                        const tokenRaw = localStorage.getItem("erp_auth_v1");
                        const token = tokenRaw ? (JSON.parse(tokenRaw).token as string) : null;
                        const fd = new FormData();
                        fd.append("file", file);
                        const uploadRes = await fetch(`/api/v1/payments/${paymentId}/proof`, {
                          method: "POST",
                          body: fd,
                          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                        });
                        if (!uploadRes.ok) {
                          throw new ApiError("UPLOAD_FAILED", "Upload bukti gagal");
                        }
                      }

                      setInvoiceId("");
                      setMethod("CASH");
                      setAmount("0");
                      setPaidAt(new Date().toISOString());
                      setNote("");
                      setFile(null);
                      setIsFormOpen(false);
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pembayaran");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Menyimpan..." : "Simpan Pembayaran"}
                </Button>
              </div>
        </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
