import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Invoice = { id: string; invoiceNo: string; totalAmount: string; status: string };
type InvoiceDetail = Invoice & { paid: string; remaining: string; customerName: string; customerCode: string };

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
        setAmount(String(r.data.remaining));
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

      <Card className="p-4">
        <div className="text-sm font-semibold">Input Pembayaran</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-1 text-xs font-medium text-zinc-600">Invoice</div>
            <select
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
            >
              <option value="">Pilih invoice</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNo} ({i.status}) - {i.totalAmount}
                </option>
              ))}
            </select>
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
                  <div className="font-semibold">{invoiceDetail.totalAmount}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Sudah Dibayar</div>
                  <div className="font-semibold">{invoiceDetail.paid}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Sisa Tagihan</div>
                  <div className="font-semibold text-emerald-700">{invoiceDetail.remaining}</div>
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

          <Input
            label="Nominal"
            type="number"
            min={0}
            max={remainingNumber ?? undefined}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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

          <div className="md:col-span-2">
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
  );
}
