import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatCurrency } from "@/lib/numberFormat";

type InvoiceState = {
  id: string;
  invoiceNo: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  paid: number;
  credited: number;
  remaining: number;
};

type Payment = {
  id: string;
  method: string;
  amount: string;
  paidAt: string;
  note: string | null;
};

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPaymentMethodLabel(method?: string | null) {
  switch (method) {
    case "CASH":
      return "Tunai";
    case "TRANSFER":
      return "Transfer";
    case "GIRO":
      return "Bilyet Giro";
    case "CARD":
      return "Kartu";
    case "CREDIT_NOTE":
      return "Nota Kredit";
    default:
      return method || "-";
  }
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceState | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);

  const badge = useMemo(() => {
    if (!invoice) return null;
    const cls =
      invoice.status === "PAID"
        ? "bg-emerald-50 text-emerald-700"
        : invoice.status === "OVERDUE"
          ? "bg-red-50 text-red-700"
          : "bg-zinc-100 text-zinc-700";
    return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{invoice.status}</span>;
  }, [invoice]);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const [invRes, payRes] = await Promise.all([
        apiFetch<{ data: InvoiceState }>(`/api/v1/invoices/${id}`),
        apiFetch<{ data: Payment[] }>(`/api/v1/payments?invoiceId=${id}`),
      ]);
      setInvoice(invRes.data);
      setPayments(payRes.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  async function handlePrintInvoice() {
    if (!id) return;
    try {
      const res = await apiFetch<{ data: any }>(`/api/v1/invoices/${id}/detail`);
      const inv = res.data;
      const companyName = escapeHtml(company?.name || "PT. ERP DISTRIBUTOR F&B");
      const companyAddress = escapeHtml(company?.address || "Alamat belum diatur").replace(/\r?\n/g, "<br/>");
      const companyPhone = escapeHtml(company?.phone || "-");

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Faktur - ${inv.invoiceNo}</title>
            <style>
              @page { size: A4; margin: 0.5in; }
              body { font-family: "Courier New", Courier, monospace; font-size: 13px; line-height: 1.4; color: #000; margin: 0; padding: 0; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
              .title { font-size: 18px; font-weight: bold; text-align: center; letter-spacing: 2px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 15px; }
              .meta-box { width: 48%; }
              .meta-box div { margin-bottom: 3px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
              th { font-weight: bold; border-bottom: 2px solid #000; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .summary { width: 50%; float: right; margin-bottom: 30px; }
              .summary table { border: none; }
              .summary th, .summary td { border: none; padding: 4px 10px; }
              .summary .total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; }
              .footer { display: flex; justify-content: space-between; margin-top: 50px; text-align: center; clear: both; }
              .signature { width: 30%; }
              .signature-line { margin-top: 50px; border-bottom: 1px solid #000; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <strong>${companyName}</strong><br/>
                ${companyAddress}<br/>
                Telp: ${companyPhone}
              </div>
              <div class="title">
                FAKTUR PENJUALAN
              </div>
            </div>
            
            <div class="meta">
              <div class="meta-box">
                <div><strong>No. Faktur :</strong> ${inv.invoiceNo}</div>
                <div><strong>Tanggal    :</strong> ${inv.invoiceDate}</div>
                <div><strong>Jatuh Tempo:</strong> ${inv.dueDate}</div>
                <div><strong>No. SO     :</strong> ${inv.soNo || '-'}</div>
              </div>
              <div class="meta-box">
                <div><strong>Kepada Yth:</strong></div>
                <div>${inv.customerCode} - ${inv.customerName}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 5%" class="text-center">No</th>
                  <th style="width: 45%">Nama Barang</th>
                  <th style="width: 10%" class="text-right">Jumlah</th>
                  <th style="width: 20%" class="text-right">Harga</th>
                  <th style="width: 20%" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${inv.items.map((it: any, i: number) => `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>${it.productName}</td>
                    <td class="text-right">${it.qty} ${it.unit}</td>
                    <td class="text-right">${formatCurrency(it.unitPrice)}</td>
                    <td class="text-right">${formatCurrency(it.lineTotal)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="summary">
              <table>
                <tr>
                  <td>Total Tagihan</td>
                  <td class="text-right">${formatCurrency(inv.totalAmount)}</td>
                </tr>
                <tr>
                  <td>Sudah Dibayar</td>
                  <td class="text-right">${formatCurrency(inv.paid)}</td>
                </tr>
                <tr>
                  <td>Note Kredit</td>
                  <td class="text-right">${formatCurrency(inv.credited ?? 0)}</td>
                </tr>
                <tr class="total">
                  <td>Sisa Tagihan</td>
                  <td class="text-right">${formatCurrency(inv.remaining)}</td>
                </tr>
              </table>
            </div>

            <div class="footer">
              <div class="signature">
                <div>Penerima / Pelanggan</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Hormat Kami (Keuangan)</div>
                <div class="signature-line"></div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data cetak invoice");
    }
  }

  async function handlePrintPayment(paymentId: string) {
    try {
      const res = await apiFetch<{ data: any }>(`/api/v1/payments/${paymentId}/detail`);
      const p = res.data;
      const companyName = escapeHtml(company?.name || "PT. ERP DISTRIBUTOR F&B");
      const companyAddress = escapeHtml(company?.address || "Alamat belum diatur").replace(/\r?\n/g, "<br/>");
      const companyPhone = escapeHtml(company?.phone || "-");

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Bukti Pembayaran - ${p.invoiceNo}</title>
            <style>
              @page { size: 9.5in 5.5in; margin: 0.5in; }
              body { font-family: "Courier New", Courier, monospace; font-size: 13px; line-height: 1.4; color: #000; margin: 0; padding: 0; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
              .title { font-size: 18px; font-weight: bold; text-align: center; letter-spacing: 2px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 15px; }
              .meta-box { width: 48%; }
              .meta-box div { margin-bottom: 5px; }
              .amount-box { border: 2px solid #000; padding: 10px; font-size: 16px; font-weight: bold; text-align: center; margin: 20px 0; background: #f9f9f9; }
              .footer { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
              .signature { width: 30%; }
              .signature-line { margin-top: 50px; border-bottom: 1px solid #000; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <strong>${companyName}</strong><br/>
                ${companyAddress}<br/>
                Telp: ${companyPhone}
              </div>
              <div class="title">
                BUKTI PEMBAYARAN<br/>(KUITANSI)
              </div>
            </div>
            
            <div class="meta">
              <div class="meta-box">
                <div><strong>Telah Terima Dari:</strong></div>
                <div>${p.customerCode} - ${p.customerName}</div>
              </div>
              <div class="meta-box">
                <div><strong>Tanggal Bayar:</strong> ${new Date(p.paidAt).toLocaleDateString("id-ID")}</div>
                <div><strong>No. Faktur   :</strong> ${p.invoiceNo}</div>
                <div><strong>Metode       :</strong> ${escapeHtml(formatPaymentMethodLabel(p.method))}</div>
              </div>
            </div>

            <div class="amount-box">
              UANG SEJUMLAH: ${formatCurrency(p.amount)}
            </div>

            <div style="margin-bottom: 20px;">
              <strong>Keterangan:</strong><br/>
              ${p.note || 'Pembayaran tagihan invoice ' + p.invoiceNo}
            </div>

            <div class="footer">
              <div class="signature">
                <div>Penyetor / Pelanggan</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Kasir / Keuangan</div>
                <div class="signature-line"></div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data cetak pembayaran");
    }
  }

  useEffect(() => {
    load();
    fetchCompany();
  }, [id, fetchCompany]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">
            <Link className="underline decoration-zinc-300 underline-offset-4" to="/invoices">
              Invoice
            </Link>{" "}
            / Detail
          </div>
          <h1 className="mt-1 text-lg font-semibold">{invoice?.invoiceNo ?? "Invoice"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <Button variant="secondary" onClick={handlePrintInvoice}>
            Cetak Invoice
          </Button>
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Link to="/payments" state={invoice ? { invoiceId: invoice.id } : undefined}>
            <Button disabled={!invoice}>Tambah Pembayaran</Button>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {invoice ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
          <Card className="p-4">
            <div className="text-sm font-semibold">Ringkasan</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Tanggal</div>
                <div className="mt-1 font-medium">{invoice.invoiceDate}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Jatuh Tempo</div>
                <div className="mt-1 font-medium">{invoice.dueDate}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Total</div>
                <div className="mt-1 whitespace-nowrap font-medium">{formatCurrency(invoice.totalAmount)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Terbayar</div>
                <div className="mt-1 whitespace-nowrap font-medium">{formatCurrency(invoice.paid)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Note Kredit</div>
                <div className="mt-1 whitespace-nowrap font-medium">{formatCurrency(invoice.credited)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">Sisa</div>
                <div className="mt-1 whitespace-nowrap font-medium">{formatCurrency(invoice.remaining)}</div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Riwayat Pembayaran</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-2">Tanggal</th>
                    <th className="px-4 py-2">Metode</th>
                    <th className="min-w-[140px] whitespace-nowrap px-4 py-2 text-right">Nominal</th>
                    <th className="px-4 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100">
                      <td className="px-4 py-2">{new Date(p.paidAt).toLocaleString("id-ID")}</td>
                      <td className="px-4 py-2">{p.method}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="secondary" onClick={() => handlePrintPayment(p.id)}>
                          Cetak Kuitansi
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                        Belum ada pembayaran.
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
