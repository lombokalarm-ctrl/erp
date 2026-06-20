import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardPenLine, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { useFieldStore } from "@/stores/fieldStore";

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

type DashboardCard = {
  label: string;
  value: string;
  to: string;
};

export default function HomePage() {
  const [customersToday, setCustomersToday] = useState(0);
  const [latestOrders, setLatestOrders] = useState<SalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const orderDrafts = useFieldStore((state) => state.orderDrafts);
  const visitDrafts = useFieldStore((state) => state.visitDrafts);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ data: Array<{ id: string }>; meta?: { total?: number } }>(
        "/api/v1/customers?page=1&pageSize=6&includeUnassigned=true",
      ),
      apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=4"),
    ])
      .then(([customers, orders]) => {
        if (!active) return;
        setCustomersToday(customers.meta?.total ?? customers.data.length);
        setLatestOrders(orders.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo<DashboardCard[]>(
    () => [
      { label: "Pelanggan aktif", value: String(customersToday), to: "/customers" },
      { label: "Draft order", value: String(orderDrafts.length), to: "/sync" },
      { label: "Visit lokal", value: String(visitDrafts.length), to: "/visits" },
      { label: "Antar hari ini", value: String(latestOrders.length), to: "/deliveries" },
    ],
    [customersToday, latestOrders.length, orderDrafts.length, visitDrafts.length],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <Link key={card.label} to={card.to}>
            <SurfaceCard className="h-full rounded-[22px] bg-white/88 px-3 py-3">
              <div className="text-[2rem] font-semibold leading-none text-zinc-950">{card.value}</div>
              <div className="mt-2 text-[11px] text-zinc-500">{card.label}</div>
            </SurfaceCard>
          </Link>
        ))}
      </div>

      <SurfaceCard className="rounded-[22px] px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-zinc-900">Quick Action</div>
            <div className="text-[11px] text-zinc-500">Akses utama versi rapat.</div>
          </div>
          <Link to="/sales-orders" className="text-[11px] font-semibold text-emerald-700">
            Buka
          </Link>
        </div>
        <div className="mt-3 grid gap-2">
          <Link className="quick-link-card items-center justify-between" to="/sales-orders">
            <div className="flex items-center gap-3">
              <div className="rounded-[12px] bg-emerald-100 p-2 text-emerald-700">
                <ClipboardPenLine className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-900">Sales Order</div>
                <div className="text-[11px] leading-4 text-zinc-500">Masuk cepat ke daftar dan form SO.</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </Link>
          <Link className="quick-link-card items-center justify-between" to="/visits">
            <div className="flex items-center gap-3">
              <div className="rounded-[12px] bg-amber-100 p-2 text-amber-700">
                <ReceiptText className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-900">Catat Kunjungan</div>
                <div className="text-[11px] leading-4 text-zinc-500">Foto toko dan tag lokasi lebih cepat.</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </Link>
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-[22px] px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold text-zinc-900">Order Terbaru</div>
          <Link to="/sales-orders" className="text-[11px] font-semibold text-emerald-700">
            Lihat semua
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="space-y-2">
              <div className="h-14 animate-pulse rounded-[18px] bg-zinc-100" />
              <div className="h-14 animate-pulse rounded-[18px] bg-zinc-100" />
            </div>
          ) : latestOrders.length ? (
            latestOrders.map((order) => (
              <div key={order.id} className="rounded-[18px] border border-zinc-200 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{order.orderNo}</div>
                    <div className="text-[11px] text-zinc-500">{order.customerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-zinc-900">{formatCurrency(order.totalAmount)}</div>
                    <div className="text-xs text-zinc-500">{formatDate(order.orderDate)}</div>
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-zinc-500">
                  SO {order.status} • Kirim {order.deliveryStatus}
                </div>
                <div className="mt-2">
                  <Link to={`/sales-order/${order.id}`} className="text-[11px] font-semibold text-emerald-700">
                    View
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="Belum ada order terbaru" description="Sales order yang baru dibuat akan muncul di sini." />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
