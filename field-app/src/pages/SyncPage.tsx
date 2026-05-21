import { useState } from "react";
import { CloudOff, RefreshCcw } from "lucide-react";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import SurfaceCard from "@/components/SurfaceCard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatDate } from "@/lib/format";
import { useFieldStore } from "@/stores/fieldStore";

export default function SyncPage() {
  const isOnline = useOnlineStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const orderDrafts = useFieldStore((state) => state.orderDrafts);
  const visitDrafts = useFieldStore((state) => state.visitDrafts);
  const removeOrderDraft = useFieldStore((state) => state.removeOrderDraft);

  async function syncNow() {
    if (!isOnline) {
      setMessage("Masih offline. Hubungkan internet dulu untuk sinkronisasi.");
      return;
    }
    setSyncing(true);
    setMessage(null);

    try {
      for (const draft of orderDrafts) {
        await apiFetch("/api/v1/sales-orders", {
          method: "POST",
          body: JSON.stringify({
            customerId: draft.customerId,
            orderDate: draft.orderDate,
            notes: draft.notes,
            items: draft.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              uom: item.uom,
              unitPrice: item.unitPrice,
              discountAmount: 0,
            })),
          }),
        });
        removeOrderDraft(draft.localId);
      }

      if (visitDrafts.length) {
        setMessage("Draft SO berhasil disinkron. Draft kunjungan masih lokal sampai endpoint visit backend diaktifkan.");
      } else {
        setMessage("Semua draft Sales Order berhasil disinkron.");
      }
    } catch {
      setMessage("Ada draft yang gagal disinkron. Coba lagi saat koneksi lebih stabil.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Pusat Sinkronisasi</div>
            <div className="mt-1 text-sm text-zinc-500">Kelola draft lapangan yang tersimpan di perangkat.</div>
          </div>
          {isOnline ? <RefreshCcw className="h-6 w-6 text-emerald-700" /> : <CloudOff className="h-6 w-6 text-amber-700" />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[24px] bg-zinc-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Draft SO</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{orderDrafts.length}</div>
          </div>
          <div className="rounded-[24px] bg-zinc-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Visit Lokal</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{visitDrafts.length}</div>
          </div>
        </div>
        <button type="button" onClick={syncNow} disabled={syncing} className="primary-button mt-4">
          <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sinkronisasi..." : "Sinkron Sekarang"}
        </button>
        {message ? <div className="mt-3 text-sm text-zinc-600">{message}</div> : null}
      </SurfaceCard>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Draft Sales Order</div>
        <div className="mt-4 space-y-3">
          {orderDrafts.length ? (
            orderDrafts.map((draft) => (
              <div key={draft.localId} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="font-medium text-zinc-900">{draft.customerName}</div>
                <div className="mt-1 text-sm text-zinc-500">{formatDate(draft.createdAt)} • {draft.items.length} item</div>
              </div>
            ))
          ) : (
            <EmptyState title="Tidak ada draft SO" description="Sales Order offline yang tersimpan akan muncul di sini." />
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Draft Kunjungan</div>
        <div className="mt-4 space-y-3">
          {visitDrafts.length ? (
            visitDrafts.map((draft) => (
              <div key={draft.localId} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="font-medium text-zinc-900">{draft.customerName}</div>
                <div className="mt-1 text-sm text-zinc-500">{draft.visitStatus} • {formatDate(draft.visitedAt)}</div>
              </div>
            ))
          ) : (
            <EmptyState title="Tidak ada draft kunjungan" description="Catatan kunjungan lokal akan tampil di sini." />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
