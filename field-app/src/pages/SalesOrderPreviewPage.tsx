import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, FileDown, RefreshCw, Share2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch, apiFetchBlob } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import StatusPill from "@/components/StatusPill";
import SurfaceCard from "@/components/SurfaceCard";
import { formatCurrency, formatDate } from "@/lib/format";

type SalesOrderDetail = {
  id: string;
  orderNo: string;
  customerCode: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  notes?: string | null;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    qty: string;
    uom: string;
    unitPrice: string;
    lineTotal: string;
  }>;
};

function getStatusTone(status: string) {
  switch (String(status || "").toUpperCase()) {
    case "CONFIRMED":
    case "DELIVERED":
      return "green" as const;
    case "DRAFT":
      return "amber" as const;
    case "CANCELLED":
      return "rose" as const;
    default:
      return "slate" as const;
  }
}

function getStatusLabel(status: string) {
  switch (String(status || "").toUpperCase()) {
    case "CONFIRMED":
      return "Terkonfirmasi";
    case "DELIVERED":
      return "Terkirim";
    case "DRAFT":
      return "Draft";
    case "CANCELLED":
      return "Dibatalkan";
    default:
      return status || "-";
  }
}

export default function SalesOrderPreviewPage() {
  const navigate = useNavigate();
  const { orderId = "" } = useParams();
  const [detail, setDetail] = useState<SalesOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDetail() {
    if (!orderId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiFetch<{ data: SalesOrderDetail }>(`/api/v1/sales-orders/${orderId}`);
      setDetail(response.data);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Gagal memuat detail Sales Order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [orderId]);

  const itemCount = useMemo(() => detail?.items.length ?? 0, [detail]);

  async function getPdfFile() {
    const result = await apiFetchBlob(`/api/v1/sales-orders/${orderId}/pdf`);
    const filename = result.filename || `${detail?.orderNo || "sales-order"}.pdf`;
    return new File([result.blob], filename, { type: "application/pdf" });
  }

  async function handleOpenPdf() {
    if (!orderId) return;
    setLoadingPdf(true);
    setMessage(null);
    try {
      const file = await getPdfFile();
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Gagal membuka PDF Sales Order.");
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleSharePdf() {
    if (!orderId) return;
    setLoadingPdf(true);
    setMessage(null);
    try {
      const file = await getPdfFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: detail?.orderNo || "Sales Order",
          text: `Sales Order ${detail?.orderNo || ""} untuk ${detail?.customerName || "pelanggan"}`,
        });
        setMessage("PDF berhasil dibagikan.");
        return;
      }

      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Perangkat belum mendukung share file. PDF diunduh agar bisa dibagikan manual.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessage(error instanceof ApiError ? error.message : "Gagal membagikan PDF Sales Order.");
    } finally {
      setLoadingPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
            <div className="mt-3 text-lg font-semibold text-zinc-950">Preview Sales Order</div>
            <div className="mt-1 text-sm text-zinc-500">Lihat detail order dan bagikan PDF ke pelanggan bila perlu.</div>
          </div>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="rounded-2xl border border-zinc-200 p-3 text-zinc-600"
            title="Muat ulang"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </SurfaceCard>

      {message ? (
        <SurfaceCard className="border-emerald-200 bg-emerald-50/90 text-sm text-emerald-800">{message}</SurfaceCard>
      ) : null}

      {loading ? (
        <SurfaceCard>
          <div className="space-y-3">
            <div className="h-6 animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
            <div className="h-52 animate-pulse rounded-2xl bg-zinc-100" />
          </div>
        </SurfaceCard>
      ) : !detail ? (
        <EmptyState title="Sales Order tidak ditemukan" description="Pastikan order masih tersedia dan Anda memiliki akses." />
      ) : (
        <>
          <SurfaceCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">No. SO</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">{detail.orderNo}</div>
                <div className="mt-1 text-sm text-zinc-500">{formatDate(detail.orderDate)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusPill tone={getStatusTone(detail.status)}>{getStatusLabel(detail.status)}</StatusPill>
                <StatusPill tone={detail.deliveryStatus === "DELIVERED" ? "green" : "amber"}>
                  {`Kirim ${detail.deliveryStatus === "DELIVERED" ? "Selesai" : detail.deliveryStatus || "Proses"}`}
                </StatusPill>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pelanggan</div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{detail.customerCode}</div>
                <div className="mt-1 text-sm text-zinc-500">{detail.customerName}</div>
              </div>
              <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Jumlah Item</div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{itemCount} baris</div>
                <div className="mt-1 text-sm text-zinc-500">{formatCurrency(detail.totalAmount)}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleOpenPdf()}
                disabled={loadingPdf}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800"
              >
                <Eye className="h-4 w-4" />
                {loadingPdf ? "Menyiapkan PDF..." : "Lihat PDF"}
              </button>
              <button
                type="button"
                onClick={() => void handleSharePdf()}
                disabled={loadingPdf}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-emerald-950 px-4 py-3 text-sm font-semibold text-white"
              >
                <Share2 className="h-4 w-4" />
                {loadingPdf ? "Menyiapkan..." : "Bagikan PDF"}
              </button>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Item Order</div>
                <div className="text-sm text-zinc-500">Preview cepat item, jumlah, satuan, dan nilai order.</div>
              </div>
              <FileDown className="h-5 w-5 text-emerald-700" />
            </div>

            <div className="mt-4 space-y-3">
              {detail.items.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{item.productName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">{item.sku}</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-zinc-900">{formatCurrency(item.lineTotal)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Qty</div>
                      <div className="mt-1 font-semibold text-zinc-900">{item.qty}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Satuan</div>
                      <div className="mt-1 font-semibold text-zinc-900">{String(item.uom || "").toUpperCase()}</div>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Harga</div>
                      <div className="mt-1 font-semibold text-zinc-900">{formatCurrency(item.unitPrice)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div className="text-sm font-semibold text-zinc-900">Ringkasan Nilai</div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between text-zinc-600">
                <span>Subtotal</span>
                <span>{formatCurrency(detail.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-600">
                <span>Diskon</span>
                <span>{formatCurrency(detail.discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-zinc-200 pt-3 text-base font-semibold text-zinc-950">
                <span>Total</span>
                <span>{formatCurrency(detail.totalAmount)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[22px] bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              <div className="font-medium text-zinc-900">Catatan</div>
              <div className="mt-1">{detail.notes || "-"}</div>
            </div>
          </SurfaceCard>

          <Link
            to="/sales-order/new"
            className="inline-flex w-full items-center justify-center rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            Buat Sales Order Baru
          </Link>
        </>
      )}
    </div>
  );
}
