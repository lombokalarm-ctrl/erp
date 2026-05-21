import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { ShieldAlert, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/numberFormat";

type ReasonType = "CREDIT_LIMIT" | "DOCUMENT_LIMIT";
type ApprovalDocument = {
  type: "INVOICE" | "SALES_ORDER";
  id: string;
  number: string;
  date: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
};

type ApprovalContext = {
  reasonTypes: ReasonType[];
  requestSummary: string;
  requestLines: string[];
  liveSummary: string;
  liveLines: string[];
  liveStatusLabel: string;
  creditSnapshot: {
    creditLimit: number;
    currentOutstanding: number;
    newOrderAmount: number;
    projectedOutstanding: number;
    exceedsLimit: boolean;
  };
  documentSnapshot: {
    salesOrderLimit: number;
    currentOpenDocumentCount: number;
    projectedOpenDocumentCount: number;
    openInvoiceCount: number;
    openSoWithoutInvoiceCount: number;
    exceedsLimit: boolean;
  };
  openDocuments: ApprovalDocument[];
};

type ApprovalRow = {
  approvalId: string;
  approvalStatus: string;
  requestSummary: string;
  requestReasonTypes: ReasonType[];
  requestedAt: string;
  salesOrderId: string;
  orderNo: string;
  totalAmount: string;
  customerName: string;
  requestedByName: string;
  liveCheck: ApprovalContext;
};

type SalesOrderDetail = {
  id: string;
  orderNo: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  notes?: string | null;
  approvals: Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    requestedAt: string;
    requestedByName: string;
    approverName?: string | null;
    processedAt?: string | null;
    requestSummary: string;
    approverNotes?: string | null;
    processSnapshot?: string | null;
  }>;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    qty: string;
    uom: string;
    unitPrice: string;
    discountAmount: string;
    lineTotal: string;
  }>;
};

function renderReasonBadge(reason: ReasonType) {
  if (reason === "CREDIT_LIMIT") {
    return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Limit Kredit</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Limit Nota</span>;
}


export default function ApprovalOrders() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approverNotes, setApproverNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<SalesOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: ApprovalRow[] }>("/api/v1/sales-orders/approvals?page=1&pageSize=50");
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat antrean approval");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleProcess(id: string, action: 'APPROVED' | 'REJECTED') {
    const notes = approverNotes[id]?.trim() ?? "";
    if (notes.length < 5) {
      setError("Catatan approver wajib diisi minimal 5 karakter sebelum memproses approval.");
      return;
    }
    if (!confirm(`Apakah Anda yakin ingin ${action === 'APPROVED' ? 'MENYETUJUI' : 'MENOLAK'} order ini?`)) return;
    
    setLoadingId(id);
    try {
      await apiFetch(`/api/v1/sales-orders/approvals/${id}/process`, {
        method: "POST",
        body: JSON.stringify({ action, notes }),
      });
      setApproverNotes((prev) => ({ ...prev, [id]: "" }));
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Gagal memproses approval");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleViewDetail(salesOrderId: string) {
    setError(null);
    setDetailLoading(true);
    try {
      const res = await apiFetch<{ data: SalesOrderDetail }>(`/api/v1/sales-orders/${salesOrderId}`);
      setDetailOrder(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat detail Sales Order");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-orange-600" />
          Antrean Persetujuan Order (Override Limit)
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Daftar Sales Order yang melebihi limit kredit pelanggan dan membutuhkan persetujuan Manajer/Admin.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Antrean Approval</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Tanggal Request</th>
                <th className="px-4 py-3">Sales Order</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-right">Nilai Order</th>
                <th className="px-4 py-3">Alasan Saat Request</th>
                <th className="px-4 py-3">Kondisi Terbaru</th>
                <th className="px-4 py-3">Catatan Approver</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.approvalId} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-800">{new Date(r.requestedAt).toLocaleDateString('id-ID')}</div>
                    <div className="text-xs text-zinc-500">Oleh: {r.requestedByName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-blue-600">
                      {r.orderNo}
                    </span>
                    <div className="mt-1">
                      <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-bold">
                        MENUNGGU PERSETUJUAN
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-700">{r.customerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-zinc-800">{formatCurrency(r.totalAmount)}</td>
                  <td className="max-w-md px-4 py-3 align-top">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {r.requestReasonTypes.length ? r.requestReasonTypes.map((reason) => (
                        <span key={reason}>{renderReasonBadge(reason)}</span>
                      )) : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">Snapshot Lama</span>}
                    </div>
                    <div className="whitespace-pre-wrap text-xs leading-5 text-red-600">{r.requestSummary || "-"}</div>
                  </td>
                  <td className="max-w-md px-4 py-3 align-top">
                    <div className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      r.liveCheck.reasonTypes.length
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {r.liveCheck.liveStatusLabel}
                    </div>
                    <div className="space-y-1 text-xs leading-5 text-zinc-700">
                      {r.liveCheck.liveLines.map((line, index) => (
                        <div key={`${r.approvalId}-live-${index}`}>{line}</div>
                      ))}
                    </div>
                    {r.liveCheck.openDocuments.length ? (
                      <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
                        {r.liveCheck.openDocuments.map((doc) => (
                          <div key={doc.id}>
                            {doc.number} • {doc.type === "INVOICE" ? "Sisa" : "Nilai SO"} {formatCurrency(doc.remainingAmount)} • {doc.status}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="min-w-[220px] px-4 py-3 align-top">
                    <textarea
                      className="min-h-[92px] w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm"
                      placeholder={r.liveCheck.reasonTypes.length ? "Tulis alasan approve/reject..." : "Contoh: kondisi customer sudah normal, approval dilanjutkan"}
                      value={approverNotes[r.approvalId] ?? ""}
                      onChange={(e) =>
                        setApproverNotes((prev) => ({
                          ...prev,
                          [r.approvalId]: e.target.value,
                        }))
                      }
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">Wajib diisi minimal 5 karakter untuk approve maupun reject.</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleViewDetail(r.salesOrderId)}
                      >
                        Detail
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => handleProcess(r.approvalId, 'APPROVED')}
                        disabled={loadingId === r.approvalId || (approverNotes[r.approvalId]?.trim().length ?? 0) < 5}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleProcess(r.approvalId, 'REJECTED')}
                        disabled={loadingId === r.approvalId || (approverNotes[r.approvalId]?.trim().length ?? 0) < 5}
                        className="bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"
                      >
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    <ShieldAlert className="h-8 w-8 mx-auto text-zinc-300 mb-2" />
                    Tidak ada antrean approval saat ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(detailOrder || detailLoading) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Detail Approval Sales Order</div>
                <p className="text-xs text-zinc-500">
                  {detailOrder ? `${detailOrder.orderNo} • ${detailOrder.customerCode} - ${detailOrder.customerName}` : "Memuat detail..."}
                </p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => {
                  setDetailOrder(null);
                  setDetailLoading(false);
                }}
              >
                Tutup
              </button>
            </div>

            {detailLoading && !detailOrder ? (
              <div className="py-10 text-center text-sm text-zinc-500">Memuat detail approval...</div>
            ) : detailOrder ? (
              <div className="space-y-4">
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-zinc-500">Tanggal:</span> {detailOrder.orderDate}</div>
                  <div><span className="text-zinc-500">Status SO:</span> {detailOrder.status}</div>
                  <div><span className="text-zinc-500">Status Kirim:</span> {detailOrder.deliveryStatus}</div>
                  <div><span className="text-zinc-500">Total:</span> {formatCurrency(detailOrder.totalAmount)}</div>
                  <div className="col-span-2"><span className="text-zinc-500">Catatan Sales:</span> {detailOrder.notes || "-"}</div>
                </div>

                <div className="rounded-lg border border-zinc-200">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                    Histori Approval
                  </div>
                  <div className="divide-y divide-zinc-200">
                    {detailOrder.approvals.length ? (
                      detailOrder.approvals.map((approval, index) => (
                        <div key={approval.id} className="space-y-3 px-4 py-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 font-medium text-zinc-800">
                              <span>
                                Request oleh {approval.requestedByName} pada {new Date(approval.requestedAt).toLocaleString("id-ID")}
                              </span>
                              {index === 0 ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                  TERAKHIR
                                </span>
                              ) : null}
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                approval.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : approval.status === "REJECTED"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {approval.status === "PENDING"
                                ? "MENUNGGU PERSETUJUAN"
                                : approval.status === "APPROVED"
                                ? "DISETUJUI"
                                : "DITOLAK"}
                            </span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-zinc-200 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Alasan Saat Request
                              </div>
                              <div className="whitespace-pre-wrap text-sm text-zinc-700">
                                {approval.requestSummary || "-"}
                              </div>
                            </div>
                            <div className="rounded-lg border border-zinc-200 bg-white p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Catatan Approver
                              </div>
                              <div className="text-sm text-zinc-700">
                                {approval.approverNotes || "-"}
                              </div>
                              <div className="mt-3 text-xs text-zinc-500">
                                Approver: {approval.approverName || "-"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                Diproses: {approval.processedAt ? new Date(approval.processedAt).toLocaleString("id-ID") : "-"}
                              </div>
                            </div>
                          </div>
                          {approval.processSnapshot ? (
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Snapshot Saat Diproses
                              </div>
                              <div className="whitespace-pre-wrap text-sm text-zinc-700">{approval.processSnapshot}</div>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-zinc-500">Belum ada histori approval untuk Sales Order ini.</div>
                    )}
                  </div>
                </div>

                <div className="overflow-auto rounded-lg border border-zinc-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Produk</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2">UOM</th>
                        <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Harga</th>
                        <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Diskon</th>
                        <th className="min-w-[130px] whitespace-nowrap px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailOrder.items.map((item) => (
                        <tr key={item.id} className="border-b border-zinc-100">
                          <td className="px-3 py-2">{item.sku}</td>
                          <td className="px-3 py-2">{item.productName}</td>
                          <td className="px-3 py-2 text-right">{item.qty}</td>
                          <td className="px-3 py-2">{item.uom}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(item.discountAmount)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
