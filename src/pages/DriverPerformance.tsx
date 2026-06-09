import { useEffect, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { formatNumber, formatPercent } from "@/lib/numberFormat";

type Region = {
  id: string;
  name: string;
};

type DriverPerformanceRow = {
  driverUserId: string;
  driverName: string;
  actualDeliveryCount: number;
  actualDeliveryPoints: number;
  deliveryContributionPct: number;
  pointContributionPct: number;
};

type DriverPerformanceMeta = {
  plannedDeliveryCount: number;
  plannedDeliveryPoints: number;
  actualDeliveryCount: number;
  actualDeliveryPoints: number;
  plannedAchievementPct: number;
};

function getDefaultMonth() {
  return new Date().getMonth() + 1;
}

function getDefaultYear() {
  return new Date().getFullYear();
}

export default function DriverPerformance() {
  const [items, setItems] = useState<DriverPerformanceRow[]>([]);
  const [month, setMonth] = useState(getDefaultMonth());
  const [year, setYear] = useState(getDefaultYear());
  const [regionId, setRegionId] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [meta, setMeta] = useState<DriverPerformanceMeta>({
    plannedDeliveryCount: 0,
    plannedDeliveryPoints: 0,
    actualDeliveryCount: 0,
    actualDeliveryPoints: 0,
    plannedAchievementPct: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const url = new URL("/api/v1/reports/driver-performance-target", window.location.origin);
      url.searchParams.set("month", String(month));
      url.searchParams.set("year", String(year));
      if (regionId) url.searchParams.set("regionId", regionId);

      const res = await apiFetch<{ data: DriverPerformanceRow[]; meta: DriverPerformanceMeta }>(url.pathname + url.search);
      setItems(res.data);
      setMeta(
        res.meta ?? {
          plannedDeliveryCount: 0,
          plannedDeliveryPoints: 0,
          actualDeliveryCount: 0,
          actualDeliveryPoints: 0,
          plannedAchievementPct: 0,
        },
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }

  async function loadRegions() {
    try {
      const res = await apiFetch<{ data: Region[] }>("/api/v1/regions");
      setRegions(res.data);
    } catch {
      setRegions([]);
    }
  }

  useEffect(() => {
    void Promise.all([loadRegions(), load()]);
  }, []);

  const summary = useMemo(() => {
    return {
      plannedDeliveryCount: meta.plannedDeliveryCount,
      actualDeliveryCount: meta.actualDeliveryCount,
      plannedDeliveryPoints: meta.plannedDeliveryPoints,
      actualDeliveryPoints: meta.actualDeliveryPoints,
      plannedAchievementPct: meta.plannedAchievementPct,
      avgContribution:
        items.length > 0 ? items.reduce((sum, row) => sum + Number(row.deliveryContributionPct || 0), 0) / items.length : 0,
    };
  }, [items, meta]);

  function handleExportCSV() {
    const headers = [
      "Nama Driver",
      "DO Ditangani",
      "Titik Kirim",
      "Kontribusi DO",
      "Kontribusi Titik Kirim",
    ];
    const rows = items.map((row) => [
      row.driverName,
      row.actualDeliveryCount,
      row.actualDeliveryPoints,
      formatPercent(row.deliveryContributionPct),
      formatPercent(row.pointContributionPct),
    ]);
    exportToCSV(`Kinerja_Driver_${year}_${String(month).padStart(2, "0")}`, headers, rows);
  }

  function handlePrint() {
    const headers = [
      "Nama Driver",
      "DO Ditangani",
      "Titik Kirim",
      "Kontribusi DO",
      "Kontribusi Titik Kirim",
    ];
    const rows = items.map((row) => [
      row.driverName,
      row.actualDeliveryCount,
      row.actualDeliveryPoints,
      formatPercent(row.deliveryContributionPct),
      formatPercent(row.pointContributionPct),
    ]);
    printTable(`Laporan Kinerja Driver ${String(month).padStart(2, "0")}/${year}`, headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Kinerja Driver</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Pantau kontribusi driver aktual dan pemenuhan jadwal pengantaran operasional untuk satu periode.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-500">Bulan</div>
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="h-10 min-w-[92px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {String(value).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Tahun</div>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || getDefaultYear()))} />
          </div>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-500">Wilayah</div>
            <select
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              className="h-10 min-w-[180px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Semua wilayah</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? "Memuat..." : "Filter"}
          </Button>
          <Button variant="secondary" onClick={handlePrint} title="Cetak Laporan">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={handleExportCSV} title="Export CSV (Excel)">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="Pemenuhan Antar"
          value={`${formatNumber(summary.actualDeliveryCount)} / ${formatNumber(summary.plannedDeliveryCount)}`}
          hint={formatPercent(summary.plannedAchievementPct)}
        />
        <SummaryCard
          label="Titik Kirim"
          value={`${formatNumber(summary.actualDeliveryPoints)} / ${formatNumber(summary.plannedDeliveryPoints)}`}
          hint="Realisasi / rencana operasional"
        />
        <SummaryCard label="Jumlah Driver" value={formatNumber(items.length)} hint="Personel pada filter ini" />
        <SummaryCard
          label="Rata-rata Kontribusi"
          value={formatPercent(summary.avgContribution)}
          hint={regionId ? "Filter wilayah aktif" : "Semua wilayah"}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
          Rekapitulasi Kontribusi Driver
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Nama Driver</th>
                <th className="px-4 py-3 text-right">DO Ditangani</th>
                <th className="px-4 py-3 text-right">Titik Kirim</th>
                <th className="px-4 py-3 text-right">Kontribusi DO</th>
                <th className="px-4 py-3 text-right">Kontribusi Titik Kirim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.driverUserId} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">{row.driverName}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.actualDeliveryCount)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.actualDeliveryPoints)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPercent(row.deliveryContributionPct)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPercent(row.pointContributionPct)}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={5}>
                    Belum ada data target kinerja driver untuk periode ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-zinc-950">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </Card>
  );
}
