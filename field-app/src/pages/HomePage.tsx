import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardPenLine, ReceiptText, Truck, Users } from "lucide-react";
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
  icon: typeof Users;
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
      { label: "Pelanggan aktif", value: String(customersToday), icon: Users, to: "/customers" },
      { label: "Draft order", value: String(orderDrafts.length), icon: ClipboardPenLine, to: "/sync" },
      { label: "Visit lokal", value: String(visitDrafts.length), icon: ReceiptText, to: "/visits" },
      { label: "Antar hari ini", value: String(latestOrders.length), icon: Truck, to: "/deliveries" },
    ],
    [customersToday, latestOrders.length, orderDrafts.length, visitDrafts.length],
  );

  return (
    <div className="space-y-4">
      <SurfaceCard className="overflow-hidden bg-[linear-gradient(135deg,#052e16,#14532d_62%,#4d7c0f)] text-white">
        <div className="text-xs uppercase tracking-[0.26em] text-emerald-200">Ringkas Hari Ini</div>
        <div className="mt-2 max-w-[17rem] text-2xl font-semibold leading-tight">
          Operasional lapangan lebih cepat, lebih fokus, dan siap dipakai di toko.
        </div>
        <div className="mt-4 flex items-center justify-between rounded-[24px] bg-white/10 px-4 py-3 text-sm">
          <span>Prioritas utama: kunjungan dengan foto, lokasi, dan follow up toko</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <Link key={card.label} to={card.to}>
            <SurfaceCard className="h-full bg-white/85">
              <div className="flex items-center justify-between">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <card.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-4 text-2xl font-semibold text-zinc-950">{card.value}</div>
              <div className="mt-1 text-sm text-zinc-500">{card.label}</div>
            </SurfaceCard>
          </Link>
        ))}
      </div>

      <SurfaceCard>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Quick Action</div>
            <div className="text-sm text-zinc-500">Masuk cepat ke alur lapangan utama.</div>
          </div>
          <Link to="/sales-order/new" className="text-sm font-medium text-emerald-700">
            Buka
          </Link>
        </div>
        <div className="mt-4 grid gap-3">
          <Link className="quick-link-card" to="/sales-order/new">
            <ClipboardPenLine className="h-5 w-5 text-emerald-700" />
            <div>
              <div className="font-medium text-zinc-900">Buat Sales Order</div>
              <div className="text-sm text-zinc-500">Cari pelanggan lalu input item dengan cepat.</div>
            </div>
          </Link>
          <Link className="quick-link-card" to="/visits">
            <ReceiptText className="h-5 w-5 text-amber-700" />
            <div>
              <div className="font-medium text-zinc-900">Catat Kunjungan</div>
              <div className="text-sm text-zinc-500">Lengkapi foto toko dan tag lokasi walau koneksi tidak stabil.</div>
            </div>
          </Link>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">Order Terbaru</div>
          <Link to="/deliveries" className="text-sm font-medium text-emerald-700">
            Lihat semua
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-2xl bg-zinc-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-zinc-100" />
            </div>
          ) : latestOrders.length ? (
            latestOrders.map((order) => (
              <div key={order.id} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{order.orderNo}</div>
                    <div className="text-sm text-zinc-500">{order.customerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-zinc-900">{formatCurrency(order.totalAmount)}</div>
                    <div className="text-xs text-zinc-500">{formatDate(order.orderDate)}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Status SO {order.status} • Kirim {order.deliveryStatus}
                </div>
                <div className="mt-3">
                  <Link to={`/sales-order/${order.id}`} className="text-sm font-medium text-emerald-700">
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
