import { useEffect, useMemo, useState } from "react";
import { CalendarDays, PackageCheck, Truck } from "lucide-react";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import StatusPill from "@/components/StatusPill";
import SurfaceCard from "@/components/SurfaceCard";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import { Link } from "react-router-dom";

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

export default function DeliveriesPage() {
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);

  useEffect(() => {
    apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=40").then((response) => {
      setOrders(response.data);
    });
  }, []);

  const deliveryOrders = useMemo(
    () => orders.filter((order) => order.status !== "DRAFT"),
    [orders],
  );

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Antar Barang</div>
            <div className="mt-1 text-sm text-zinc-500">
              Tampilan ringkas untuk {user?.role === "Driver" ? "driver" : "sales"} saat mengecek pengiriman aktif.
            </div>
          </div>
          <Truck className="h-6 w-6 text-emerald-700" />
        </div>
      </SurfaceCard>

      <div className="space-y-3">
        {deliveryOrders.length ? (
          deliveryOrders.map((order) => (
            <SurfaceCard key={order.id} className="bg-white/90">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-zinc-500">{formatDate(order.orderDate)}</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{order.orderNo}</div>
                  <div className="mt-1 text-sm text-zinc-500">{order.customerName}</div>
                </div>
                <StatusPill tone={order.deliveryStatus === "DELIVERED" ? "green" : "amber"}>
                  {order.deliveryStatus === "DELIVERED" ? "Selesai" : order.deliveryStatus || "Proses"}
                </StatusPill>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Tanggal
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{formatDate(order.orderDate)}</div>
                </div>
                <div className="rounded-[22px] bg-zinc-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    <PackageCheck className="h-3.5 w-3.5" />
                    Nilai Order
                  </div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{formatCurrency(order.totalAmount)}</div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500">
                Tahap berikutnya: hubungkan ke detail DO dan update status antar khusus driver.
              </div>
              <div className="mt-3">
                <Link to={`/sales-order/${order.id}`} className="text-sm font-medium text-emerald-700">
                  View SO
                </Link>
              </div>
            </SurfaceCard>
          ))
        ) : (
          <EmptyState title="Belum ada pengiriman aktif" description="Sales order yang siap kirim akan tampil di sini." />
        )}
      </div>
    </div>
  );
}
