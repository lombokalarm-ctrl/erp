import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { Camera, Download, MapPinned, Printer, RefreshCcw } from "lucide-react";
import { exportToCSV, printTable } from "@/lib/exportUtils";

type VisitStatus = "OPEN" | "CLOSED" | "NOT_FOUND" | "FOLLOW_UP";

type VisitPhoto = {
  id: string;
  url: string;
  capturedAt: string | null;
  originalName: string;
};

type SalesVisitRow = {
  id: string;
  visitStatus: VisitStatus;
  note: string | null;
  visitedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  locationCapturedAt: string | null;
  customerCode: string | null;
  customerName: string | null;
  salesName: string | null;
  photos: VisitPhoto[];
};

const statusOptions: Array<{ value: "" | VisitStatus; label: string }> = [
  { value: "", label: "Semua status" },
  { value: "OPEN", label: "Toko buka" },
  { value: "CLOSED", label: "Toko tutup" },
  { value: "NOT_FOUND", label: "Tidak ditemukan" },
  { value: "FOLLOW_UP", label: "Perlu follow up" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: VisitStatus) {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

export default function SalesVisitReport() {
  const [items, setItems] = useState<SalesVisitRow[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"" | VisitStatus>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/v1/reports/sales-visits", window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
      if (status) url.searchParams.set("status", status);
      if (query.trim()) url.searchParams.set("q", query.trim());

      const res = await apiFetch<{ data: SalesVisitRow[] }>(url.pathname + url.search);
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan kunjungan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    return {
      totalVisits: items.length,
      totalPhotos: items.reduce((acc, item) => acc + item.photos.length, 0),
      openVisits: items.filter((item) => item.visitStatus === "OPEN").length,
      followUps: items.filter((item) => item.visitStatus === "FOLLOW_UP").length,
    };
  }, [items]);

  function handleExportCSV() {
    const headers = [
      "Waktu Kunjungan",
      "Sales",
      "Kode Pelanggan",
      "Nama Pelanggan",
      "Status",
      "Jumlah Foto",
      "Latitude",
      "Longitude",
      "Akurasi (m)",
      "Catatan",
    ];
    const rows = items.map((item) => [
      formatDateTime(item.visitedAt),
      item.salesName ?? "-",
      item.customerCode ?? "-",
      item.customerName ?? "-",
      getStatusLabel(item.visitStatus),
      item.photos.length,
      item.latitude.toFixed(6),
      item.longitude.toFixed(6),
      item.accuracyMeters ?? "-",
      item.note ?? "-",
    ]);
    exportToCSV("Laporan_Kunjungan_Sales", headers, rows);
  }

  function handlePrint() {
    const headers = ["Waktu", "Sales", "Pelanggan", "Status", "Foto", "Koordinat", "Catatan"];
    const rows = items.map((item) => [
      formatDateTime(item.visitedAt),
      item.salesName ?? "-",
      `${item.customerCode ?? "-"} - ${item.customerName ?? "-"}`,
      getStatusLabel(item.visitStatus),
      `${item.photos.length} foto`,
      `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`,
      item.note ?? "-",
    ]);
    printTable("Laporan Kunjungan Sales", headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Kunjungan Sales</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Monitor kunjungan pelanggan lengkap dengan foto bukti dan tag lokasi lapangan.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" label="Mulai Tanggal" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" label="Sampai Tanggal" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Status</div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | VisitStatus)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-200/60"
            >
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Cari Sales / Pelanggan"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nama sales, kode, atau pelanggan"
          />
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Filter
          </Button>
          <Button variant="secondary" onClick={handlePrint} title="Cetak Laporan">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={handleExportCSV} title="Export CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total Kunjungan</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{summary.totalVisits}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total Foto</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{summary.totalPhotos}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Toko Buka</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-700">{summary.openVisits}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Perlu Follow Up</div>
          <div className="mt-2 text-2xl font-semibold text-amber-700">{summary.followUps}</div>
        </Card>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  {item.customerCode ?? "-"} - {item.customerName ?? "-"}
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {item.salesName ?? "-"} • {formatDateTime(item.visitedAt)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {getStatusLabel(item.visitStatus)}
                </span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {item.photos.length} foto
                </span>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Koordinat</div>
                    <div className="mt-2 font-medium text-zinc-900">
                      {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                    </div>
                    <div className="mt-1 text-zinc-500">
                      Akurasi: {item.accuracyMeters ? `${Math.round(item.accuracyMeters)} m` : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Tag Lokasi</div>
                    <div className="mt-2 font-medium text-zinc-900">{formatDateTime(item.locationCapturedAt)}</div>
                    <a
                      href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sky-700"
                    >
                      <MapPinned className="h-4 w-4" />
                      Buka di Google Maps
                    </a>
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Catatan Lapangan</div>
                  <div className="mt-2 whitespace-pre-wrap text-zinc-700">{item.note || "-"}</div>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <Camera className="h-4 w-4 text-zinc-500" />
                  Foto Kunjungan
                </div>
                {item.photos.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {item.photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                      >
                        <img src={photo.url} alt={photo.originalName} className="h-32 w-full object-cover" />
                        <div className="space-y-1 px-3 py-2">
                          <div className="line-clamp-1 text-xs font-medium text-zinc-900">{photo.originalName}</div>
                          <div className="text-[11px] text-zinc-500">{formatDateTime(photo.capturedAt)}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
                    Belum ada foto tersimpan.
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {!loading && items.length === 0 ? (
          <Card className="px-4 py-10 text-center text-sm text-zinc-500">
            Belum ada data kunjungan yang cocok dengan filter saat ini.
          </Card>
        ) : null}
      </div>
    </div>
  );
}
