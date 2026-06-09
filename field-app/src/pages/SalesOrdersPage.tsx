import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Eye, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import StatusPill from "@/components/StatusPill";
import SurfaceCard from "@/components/SurfaceCard";
import { formatCurrency, formatDate } from "@/lib/format";

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

function getOrderTone(status: string) {
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

function getOrderLabel(status: string) {
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

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=50");
      setOrders(response.data);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Gagal memuat daftar Sales Order.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const totals = useMemo(() => {
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    return {
      count: orders.length,
      totalAmount,
    };
  }, [orders]);

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Daftar Sales Order</div>
            <div className="mt-1 text-sm text-zinc-500">Semua SO milik Anda tampil di sini agar preview dan share PDF lebih konsisten.</div>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="rounded-2xl border border-zinc-200 p-3 text-zinc-600"
            title="Muat ulang"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total SO</div>
            <div className="mt-2 text-xl font-semibold text-zinc-950">{totals.count}</div>
            <div className="mt-1 text-sm text-zinc-500">Termasuk draft dan order terkirim</div>
          </div>
          <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Nilai Total</div>
            <div className="mt-2 text-xl font-semibold text-zinc-950">{formatCurrency(totals.totalAmount)}</div>
            <div className="mt-1 text-sm text-zinc-500">Akumulasi dari daftar yang tampil</div>
          </div>
        </div>

        <div className="mt-4">
          <Link
            to="/sales-order/new"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-emerald-950 px-4 py-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Buat Sales Order Baru
          </Link>
        </div>
      </SurfaceCard>

      {message ? (
        <SurfaceCard className="border-amber-200 bg-amber-50/90 text-sm text-amber-800">{message}</SurfaceCard>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <SurfaceCard><div className="h-28 animate-pulse rounded-2xl bg-zinc-100" /></SurfaceCard>
          <SurfaceCard><div className="h-28 animate-pulse rounded-2xl bg-zinc-100" /></SurfaceCard>
          <SurfaceCard><div className="h-28 animate-pulse rounded-2xl bg-zinc-100" /></SurfaceCard>
        </div>
      ) : orders.length ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <SurfaceCard key={order.id} className="bg-white/90">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-zinc-500">{formatDate(order.orderDate)}</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{order.orderNo}</div>
                  <div className="mt-1 text-sm text-zinc-500">{order.customerName}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusPill tone={getOrderTone(order.status)}>{getOrderLabel(order.status)}</StatusPill>
                  <StatusPill tone={order.deliveryStatus === "DELIVERED" ? "green" : "amber"}>
                    {`Kirim ${order.deliveryStatus === "DELIVERED" ? "Selesai" : order.deliveryStatus || "Proses"}`}
                  </StatusPill>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] bg-zinc-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Nilai Order</div>
                <div className="mt-2 text-base font-semibold text-zinc-950">{formatCurrency(order.totalAmount)}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link
                  to={`/sales-order/${order.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
                >
                  <Eye className="h-4 w-4" />
                  View
                </Link>
                <Link
                  to={`/sales-order/${order.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-emerald-950 px-4 py-3 text-sm font-semibold text-white"
                >
                  <ClipboardList className="h-4 w-4" />
                  Preview & Share
                </Link>
              </div>
            </SurfaceCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Belum ada Sales Order"
          description="Sales order yang Anda buat akan muncul di sini dan bisa dibuka untuk preview atau share PDF."
        />
      )}
    </div>
  );
}
