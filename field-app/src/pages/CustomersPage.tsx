import { useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import StatusPill from "@/components/StatusPill";
import SurfaceCard from "@/components/SurfaceCard";

type Customer = {
  id: string;
  code: string;
  name: string;
  ownerName?: string | null;
  category: string;
  phone?: string | null;
  address?: string | null;
  status: "ACTIVE" | "BLOCKED";
};

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      apiFetch<{ data: Customer[] }>(
        `/api/v1/customers?page=1&pageSize=30&includeUnassigned=true&q=${encodeURIComponent(q)}`,
      )
        .then((response) => setItems(response.data))
        .finally(() => setLoading(false));
    }, 200);

    return () => window.clearTimeout(handle);
  }, [q]);

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="text-lg font-semibold text-zinc-950">Pelanggan Lapangan</div>
        <div className="mt-1 text-sm text-zinc-500">Cari pelanggan, cek status, lalu lanjut ke order atau tagihan.</div>
        <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-zinc-200 bg-zinc-50 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            placeholder="Cari nama toko atau kode pelanggan..."
          />
        </div>
      </SurfaceCard>

      <div className="space-y-3">
        {loading ? (
          <>
            <div className="h-28 animate-pulse rounded-[26px] bg-white/70" />
            <div className="h-28 animate-pulse rounded-[26px] bg-white/70" />
          </>
        ) : items.length ? (
          items.map((customer) => (
            <Link key={customer.id} to={`/customers/${customer.id}`} className="block">
              <SurfaceCard className="bg-white/90 transition hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-zinc-500">{customer.code}</div>
                    <div className="mt-1 text-lg font-semibold text-zinc-950">{customer.name}</div>
                    <div className="mt-1 text-sm text-zinc-500">{customer.ownerName || customer.category}</div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-zinc-400" />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm text-zinc-500">{customer.address || customer.phone || "Belum ada alamat"}</div>
                  <StatusPill tone={customer.status === "ACTIVE" ? "green" : "rose"}>
                    {customer.status === "ACTIVE" ? "Aktif" : "Diblokir"}
                  </StatusPill>
                </div>
              </SurfaceCard>
            </Link>
          ))
        ) : (
          <EmptyState title="Pelanggan tidak ditemukan" description="Coba kata kunci lain atau kosongkan pencarian." />
        )}
      </div>
    </div>
  );
}
