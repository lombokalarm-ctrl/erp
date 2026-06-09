import { Fragment, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { exportToCSV, printTable } from "@/lib/exportUtils";
import { Download, Printer } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/numberFormat";

type Region = {
  id: string;
  name: string;
};

type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

type ScheduleBreakdown = {
  id: string;
  regionId: string;
  regionName: string;
  dayOfWeek: DayOfWeek;
  targetVisitCountPerDay: number;
  targetVisitCount: number;
  actualVisitCount: number;
  achievementPct: number;
  routeNotes?: string | null;
};

type SalesPerformanceRow = {
  salesTargetId: string;
  salesUserId: string;
  salesName: string;
  targetVisitCount: number;
  actualVisitCount: number;
  visitAchievementPct: number;
  targetSalesOrderCount: number;
  actualSalesOrderCount: number;
  salesOrderAchievementPct: number;
  targetSalesAmount: string;
  actualSalesAmount: string;
  salesAchievementPct: number;
  scheduleBreakdown: ScheduleBreakdown[];
};

const dayLabels: Record<DayOfWeek, string> = {
  MONDAY: "Senin",
  TUESDAY: "Selasa",
  WEDNESDAY: "Rabu",
  THURSDAY: "Kamis",
  FRIDAY: "Jumat",
  SATURDAY: "Sabtu",
  SUNDAY: "Minggu",
};

function getDefaultMonth() {
  return new Date().getMonth() + 1;
}

function getDefaultYear() {
  return new Date().getFullYear();
}

function buildScheduleSummary(row: SalesPerformanceRow) {
  if (!row.scheduleBreakdown.length) return "-";
  return row.scheduleBreakdown
    .map(
      (schedule) =>
        `${schedule.regionName} ${dayLabels[schedule.dayOfWeek]} (${formatNumber(schedule.actualVisitCount)}/${formatNumber(
          schedule.targetVisitCount,
        )})`,
    )
    .join("; ");
}

export default function SalesPerformance() {
  const [items, setItems] = useState<SalesPerformanceRow[]>([]);
  const [month, setMonth] = useState(getDefaultMonth());
  const [year, setYear] = useState(getDefaultYear());
  const [regionId, setRegionId] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const url = new URL("/api/v1/reports/sales-performance-target", window.location.origin);
      url.searchParams.set("month", String(month));
      url.searchParams.set("year", String(year));
      if (regionId) url.searchParams.set("regionId", regionId);

      const res = await apiFetch<{ data: SalesPerformanceRow[] }>(url.pathname + url.search);
      setItems(res.data);
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
    const targetVisitCount = items.reduce((sum, row) => sum + Number(row.targetVisitCount || 0), 0);
    const actualVisitCount = items.reduce((sum, row) => sum + Number(row.actualVisitCount || 0), 0);
    const targetSalesOrderCount = items.reduce((sum, row) => sum + Number(row.targetSalesOrderCount || 0), 0);
    const actualSalesOrderCount = items.reduce((sum, row) => sum + Number(row.actualSalesOrderCount || 0), 0);
    const targetSalesAmount = items.reduce((sum, row) => sum + Number(row.targetSalesAmount || 0), 0);
    const actualSalesAmount = items.reduce((sum, row) => sum + Number(row.actualSalesAmount || 0), 0);

    return {
      targetVisitCount,
      actualVisitCount,
      targetSalesOrderCount,
      actualSalesOrderCount,
      targetSalesAmount,
      actualSalesAmount,
      visitAchievementPct:
        targetVisitCount > 0 ? (actualVisitCount / targetVisitCount) * 100 : actualVisitCount > 0 ? 100 : 0,
      salesOrderAchievementPct:
        targetSalesOrderCount > 0 ? (actualSalesOrderCount / targetSalesOrderCount) * 100 : actualSalesOrderCount > 0 ? 100 : 0,
      salesAchievementPct:
        targetSalesAmount > 0 ? (actualSalesAmount / targetSalesAmount) * 100 : actualSalesAmount > 0 ? 100 : 0,
    };
  }, [items]);

  function handleExportCSV() {
    const headers = [
      "Nama Sales",
      "Target Kunjungan",
      "Realisasi Kunjungan",
      "% Kunjungan",
      "Target SO",
      "Realisasi SO",
      "% SO",
      "Target Penjualan",
      "Realisasi Penjualan",
      "% Penjualan",
      "Breakdown Jadwal",
    ];
    const rows = items.map((row) => [
      row.salesName,
      row.targetVisitCount,
      row.actualVisitCount,
      formatPercent(row.visitAchievementPct),
      row.targetSalesOrderCount,
      row.actualSalesOrderCount,
      formatPercent(row.salesOrderAchievementPct),
      formatCurrency(row.targetSalesAmount),
      formatCurrency(row.actualSalesAmount),
      formatPercent(row.salesAchievementPct),
      buildScheduleSummary(row),
    ]);
    exportToCSV(`Kinerja_Sales_${year}_${String(month).padStart(2, "0")}`, headers, rows);
  }

  function handlePrint() {
    const headers = [
      "Nama Sales",
      "Target Kunjungan",
      "Realisasi Kunjungan",
      "% Kunjungan",
      "Target SO",
      "Realisasi SO",
      "% SO",
      "Target Penjualan",
      "Realisasi Penjualan",
      "% Penjualan",
      "Breakdown Jadwal",
    ];
    const rows = items.map((row) => [
      row.salesName,
      row.targetVisitCount,
      row.actualVisitCount,
      formatPercent(row.visitAchievementPct),
      row.targetSalesOrderCount,
      row.actualSalesOrderCount,
      formatPercent(row.salesOrderAchievementPct),
      formatCurrency(row.targetSalesAmount),
      formatCurrency(row.actualSalesAmount),
      formatPercent(row.salesAchievementPct),
      buildScheduleSummary(row),
    ]);
    printTable(`Laporan Kinerja Sales ${String(month).padStart(2, "0")}/${year}`, headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Laporan Kinerja Sales</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Pantau target vs realisasi kunjungan, jumlah SO, dan omzet per sales dengan breakdown jadwal wilayah dan hari.
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
          label="Kunjungan"
          value={`${formatNumber(summary.actualVisitCount)} / ${formatNumber(summary.targetVisitCount)}`}
          hint={formatPercent(summary.visitAchievementPct)}
        />
        <SummaryCard
          label="Sales Order"
          value={`${formatNumber(summary.actualSalesOrderCount)} / ${formatNumber(summary.targetSalesOrderCount)}`}
          hint={formatPercent(summary.salesOrderAchievementPct)}
        />
        <SummaryCard
          label="Penjualan"
          value={`${formatCurrency(summary.actualSalesAmount)} / ${formatCurrency(summary.targetSalesAmount)}`}
          hint={formatPercent(summary.salesAchievementPct)}
        />
        <SummaryCard label="Jumlah Sales" value={formatNumber(items.length)} hint="Sales pada filter ini" />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Rekapitulasi Kinerja Sales</div>
        <div className="overflow-auto">
          <table className="min-w-[1220px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Nama Sales</th>
                <th className="px-4 py-3 text-right">Target Kunjungan</th>
                <th className="px-4 py-3 text-right">Realisasi Kunjungan</th>
                <th className="px-4 py-3 text-right">% Kunjungan</th>
                <th className="px-4 py-3 text-right">Target SO</th>
                <th className="px-4 py-3 text-right">Realisasi SO</th>
                <th className="px-4 py-3 text-right">% SO</th>
                <th className="px-4 py-3 text-right">Target Penjualan</th>
                <th className="px-4 py-3 text-right">Realisasi Penjualan</th>
                <th className="px-4 py-3 text-right">% Penjualan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <Fragment key={row.salesTargetId}>
                  <tr key={row.salesTargetId} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium">{row.salesName}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.targetVisitCount)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.actualVisitCount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPercent(row.visitAchievementPct)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.targetSalesOrderCount)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(row.actualSalesOrderCount)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatPercent(row.salesOrderAchievementPct)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(row.targetSalesAmount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(row.actualSalesAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatPercent(row.salesAchievementPct)}</td>
                  </tr>
                  <tr key={`${row.salesTargetId}-detail`} className="border-b border-zinc-100 bg-zinc-50/60">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Breakdown Jadwal</div>
                      {row.scheduleBreakdown.length > 0 ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {row.scheduleBreakdown.map((schedule) => (
                            <div key={schedule.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                              <div className="text-sm font-medium text-zinc-900">
                                {schedule.regionName} - {dayLabels[schedule.dayOfWeek]}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                Target/hari {formatNumber(schedule.targetVisitCountPerDay)} | Target/bulan {formatNumber(schedule.targetVisitCount)}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                Realisasi {formatNumber(schedule.actualVisitCount)} | {formatPercent(schedule.achievementPct)}
                              </div>
                              {schedule.routeNotes ? <div className="mt-1 text-xs text-zinc-500">{schedule.routeNotes}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm text-zinc-500">Belum ada jadwal kunjungan pada periode ini.</div>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={10}>
                    Belum ada data target kinerja sales untuk periode ini.
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
