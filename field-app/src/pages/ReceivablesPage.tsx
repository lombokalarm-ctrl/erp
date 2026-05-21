import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import SurfaceCard from "@/components/SurfaceCard";
import { formatCurrency, formatDate } from "@/lib/format";

type Receivable = {
  id: string;
  invoiceNo: string;
  customerName: string;
  dueDate: string;
  remainingAmount: string;
  status: string;
};

type Aging = {
  "0_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
};

export default function ReceivablesPage() {
  const { customerId = "" } = useParams();
  const [items, setItems] = useState<Receivable[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);

  useEffect(() => {
    if (!customerId) return;
    Promise.all([
      apiFetch<{ data: Receivable[] }>(`/api/v1/receivables?page=1&pageSize=20&customerId=${customerId}`),
      apiFetch<{ data: Aging }>(`/api/v1/receivables/aging?customerId=${customerId}`),
    ]).then(([receivablesResponse, agingResponse]) => {
      setItems(receivablesResponse.data);
      setAging(agingResponse.data);
    });
  }, [customerId]);

  return (
    <div className="space-y-4">
      <Link to={`/customers/${customerId}`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke detail pelanggan
      </Link>

      <SurfaceCard>
        <div className="text-lg font-semibold text-zinc-950">Tagihan Pelanggan</div>
        <div className="mt-1 text-sm text-zinc-500">Ringkasan invoice aktif dan aging piutang pelanggan.</div>
      </SurfaceCard>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "0-30", key: "0_30" },
          { label: "31-60", key: "31_60" },
          { label: "61-90", key: "61_90" },
          { label: ">90", key: "90_plus" },
        ].map((bucket) => (
          <SurfaceCard key={bucket.key} className="bg-white/85">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Aging {bucket.label}</div>
            <div className="mt-2 text-xl font-semibold text-zinc-950">
              {formatCurrency(aging?.[bucket.key as keyof Aging] ?? 0)}
            </div>
          </SurfaceCard>
        ))}
      </div>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Invoice Aktif</div>
        <div className="mt-4 space-y-3">
          {items.length ? (
            items.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{item.invoiceNo}</div>
                    <div className="text-sm text-zinc-500">Jatuh tempo {formatDate(item.dueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-zinc-900">{formatCurrency(item.remainingAmount)}</div>
                    <div className="text-xs text-zinc-500">{item.status}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="Tidak ada invoice aktif" description="Tagihan pelanggan yang belum lunas akan muncul di sini." />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
