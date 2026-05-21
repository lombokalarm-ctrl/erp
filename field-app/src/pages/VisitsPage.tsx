import { useEffect, useState } from "react";
import { ClipboardCheck, MapPinned } from "lucide-react";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import SurfaceCard from "@/components/SurfaceCard";
import { formatDate, generateLocalId } from "@/lib/format";
import { useFieldStore } from "@/stores/fieldStore";

type Customer = {
  id: string;
  name: string;
  code: string;
};

const visitOptions = [
  { value: "OPEN", label: "Toko buka" },
  { value: "CLOSED", label: "Toko tutup" },
  { value: "NOT_FOUND", label: "Tidak ditemukan" },
  { value: "FOLLOW_UP", label: "Perlu follow up" },
] as const;

export default function VisitsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [visitStatus, setVisitStatus] = useState<(typeof visitOptions)[number]["value"]>("OPEN");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const visitDrafts = useFieldStore((state) => state.visitDrafts);
  const addVisitDraft = useFieldStore((state) => state.addVisitDraft);
  const removeVisitDraft = useFieldStore((state) => state.removeVisitDraft);

  useEffect(() => {
    apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=50").then((response) => {
      setCustomers(response.data);
    });
  }, []);

  function handleSaveVisit() {
    if (!customerId) {
      setMessage("Pilih pelanggan terlebih dahulu.");
      return;
    }
    const customer = customers.find((item) => item.id === customerId);
    addVisitDraft({
      localId: generateLocalId("visit"),
      customerId,
      customerName: customer?.name ?? "Pelanggan",
      visitStatus,
      note,
      visitedAt: new Date().toISOString(),
      status: "PENDING_SYNC",
    });
    setNote("");
    setMessage("Visit tersimpan lokal dan siap disinkron nanti.");
  }

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Kunjungan Toko</div>
            <div className="mt-1 text-sm text-zinc-500">Catat hasil visit cepat, walau koneksi belum stabil.</div>
          </div>
          <MapPinned className="h-6 w-6 text-emerald-700" />
        </div>
        <div className="mt-4 space-y-3">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="field-input">
            <option value="">Pilih pelanggan</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} - {customer.name}
              </option>
            ))}
          </select>
          <select value={visitStatus} onChange={(event) => setVisitStatus(event.target.value as typeof visitStatus)} className="field-input">
            {visitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="field-input min-h-24 resize-none"
            placeholder="Catatan hasil visit, stok toko, permintaan pelanggan, atau tindak lanjut..."
          />
          <button type="button" onClick={handleSaveVisit} className="primary-button">
            <ClipboardCheck className="h-4 w-4" />
            Simpan Visit Lokal
          </button>
          {message ? <div className="text-sm text-emerald-700">{message}</div> : null}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Visit Tersimpan</div>
        <div className="mt-4 space-y-3">
          {visitDrafts.length ? (
            visitDrafts.map((visit) => (
              <div key={visit.localId} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{visit.customerName}</div>
                    <div className="text-sm text-zinc-500">{formatDate(visit.visitedAt)}</div>
                  </div>
                  <button type="button" className="text-sm text-rose-600" onClick={() => removeVisitDraft(visit.localId)}>
                    Hapus
                  </button>
                </div>
                <div className="mt-2 text-sm text-zinc-700">{visit.note || "-"}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-400">{visit.visitStatus}</div>
              </div>
            ))
          ) : (
            <EmptyState title="Belum ada visit tersimpan" description="Visit yang Anda catat akan muncul di sini sebelum disinkron." />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
