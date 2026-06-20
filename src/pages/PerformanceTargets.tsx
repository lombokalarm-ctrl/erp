import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Copy, LockOpen, Plus, RefreshCcw, Save, Target, Trash2, Truck, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency, formatNumber } from "@/lib/numberFormat";
import { useAuthStore } from "@/stores/authStore";
import { formatDateTime } from "@/lib/date";

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

type SalesVisitSchedule = {
  id?: string;
  regionId: string;
  regionName?: string | null;
  dayOfWeek: DayOfWeek;
  targetVisitCount: number;
  routeNotes?: string | null;
};

type DeliverySchedule = {
  id?: string;
  regionId: string;
  regionName?: string | null;
  dayOfWeek: DayOfWeek;
  targetDeliveryCount: number;
  targetDeliveryPoints: number;
  routeNotes?: string | null;
};

type SalesTarget = {
  id: string;
  salesUserId: string;
  salesName: string;
  targetSalesAmount: string;
  targetSalesOrderCount: number;
  notes?: string | null;
  isActive: boolean;
  visitSchedules: SalesVisitSchedule[];
};

type PeriodDetail = {
  id: string;
  month: number;
  year: number;
  periodKey: string;
  status: "DRAFT" | "ACTIVE" | "FINAL";
  notes?: string | null;
  finalizedAt?: string | null;
  salesTargets: SalesTarget[];
  deliverySchedules: DeliverySchedule[];
};

type PeriodListItem = {
  id: string;
  month: number;
  year: number;
  periodKey: string;
  status: "DRAFT" | "ACTIVE" | "FINAL";
};

const dayOptions: Array<{ value: DayOfWeek; short: string; label: string }> = [
  { value: "MONDAY", short: "Sen", label: "Senin" },
  { value: "TUESDAY", short: "Sel", label: "Selasa" },
  { value: "WEDNESDAY", short: "Rab", label: "Rabu" },
  { value: "THURSDAY", short: "Kam", label: "Kamis" },
  { value: "FRIDAY", short: "Jum", label: "Jumat" },
  { value: "SATURDAY", short: "Sab", label: "Sabtu" },
  { value: "SUNDAY", short: "Min", label: "Minggu" },
];

function getDefaultMonth() {
  return new Date().getMonth() + 1;
}

function getDefaultYear() {
  return new Date().getFullYear();
}

function getPreviousPeriodKey(month: number, year: number) {
  const current = new Date(year, month - 1, 1);
  current.setMonth(current.getMonth() - 1);
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoneyInput(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function normalizePeriodDetail(period: PeriodDetail): PeriodDetail {
  return {
    ...period,
    salesTargets: period.salesTargets.map((target) => ({
      ...target,
      targetSalesAmount: formatMoneyInput(target.targetSalesAmount),
      visitSchedules: target.visitSchedules.map((schedule) => ({
        ...schedule,
        regionName: schedule.regionName ?? null,
      })),
    })),
    deliverySchedules: period.deliverySchedules.map((schedule) => ({
      ...schedule,
      regionName: schedule.regionName ?? null,
    })),
  };
}

function formatStatusLabel(status: PeriodDetail["status"]) {
  if (status === "FINAL") return "Final";
  if (status === "ACTIVE") return "Aktif";
  return "Draft";
}

function toJsDay(day: DayOfWeek) {
  switch (day) {
    case "MONDAY":
      return 1;
    case "TUESDAY":
      return 2;
    case "WEDNESDAY":
      return 3;
    case "THURSDAY":
      return 4;
    case "FRIDAY":
      return 5;
    case "SATURDAY":
      return 6;
    case "SUNDAY":
      return 0;
  }
}

function countWeekdayOccurrences(month: number, year: number, day: DayOfWeek) {
  const target = toJsDay(day);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (cursor.getUTCMonth() === month - 1) {
    if (cursor.getUTCDay() === target) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function formatMonthlyScheduleTarget(perDayTarget: number, month: number, year: number, dayOfWeek: DayOfWeek) {
  return perDayTarget * countWeekdayOccurrences(month, year, dayOfWeek);
}

export default function PerformanceTargets() {
  const hasAnyPermission = useAuthStore((state) => state.hasAnyPermission);
  const [month, setMonth] = useState(getDefaultMonth());
  const [year, setYear] = useState(getDefaultYear());
  const [regionId, setRegionId] = useState("");
  const [search, setSearch] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = hasAnyPermission(["performance_targets:write"]);
  const canFinalize = hasAnyPermission(["performance_targets:finalize"]);

  async function loadRegions() {
    const res = await apiFetch<{ data: Region[] }>("/api/v1/regions");
    setRegions(res.data);
  }

  async function loadCurrentPeriod(selectedMonth = month, selectedYear = year) {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<{ data: PeriodListItem[] }>(
        `/api/v1/performance-targets?month=${selectedMonth}&year=${selectedYear}&page=1&pageSize=1`,
      );
      const current = list.data[0];
      if (!current) {
        setDetail(null);
        setMessage(null);
        return;
      }
      const detailRes = await apiFetch<{ data: PeriodDetail }>(`/api/v1/performance-targets/${current.id}`);
      setDetail(normalizePeriodDetail(detailRes.data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat target kinerja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([loadRegions(), loadCurrentPeriod()]);
  }, []);

  useEffect(() => {
    void loadCurrentPeriod(month, year);
  }, [month, year]);

  const filteredSalesTargets = useMemo(() => {
    if (!detail) return [];
    const query = search.trim().toLowerCase();
    return detail.salesTargets.filter((target) => {
      const matchesName = !query || target.salesName.toLowerCase().includes(query);
      const hasRegionMatch =
        !regionId || target.visitSchedules.some((schedule) => schedule.regionId === regionId);
      return matchesName && hasRegionMatch;
    });
  }, [detail, regionId, search]);

  const filteredDeliverySchedules = useMemo(() => {
    if (!detail) return [];
    return detail.deliverySchedules.filter((schedule) => !regionId || schedule.regionId === regionId);
  }, [detail, regionId]);

  const summary = useMemo(() => {
    const totalVisitTarget = filteredSalesTargets.reduce(
      (sum, target) =>
        sum +
        target.visitSchedules
          .filter((schedule) => !regionId || schedule.regionId === regionId)
          .reduce(
            (scheduleSum, schedule) =>
              scheduleSum + formatMonthlyScheduleTarget(schedule.targetVisitCount, month, year, schedule.dayOfWeek),
            0,
          ),
      0,
    );

    const totalSalesTarget = filteredSalesTargets.reduce((sum, target) => sum + parseMoneyInput(target.targetSalesAmount), 0);
    const totalSalesOrderTarget = filteredSalesTargets.reduce((sum, target) => sum + Number(target.targetSalesOrderCount || 0), 0);
    const totalDeliveryTarget = filteredDeliverySchedules.reduce(
      (sum, schedule) => sum + formatMonthlyScheduleTarget(schedule.targetDeliveryCount, month, year, schedule.dayOfWeek),
      0,
    );
    const totalDeliveryPointTarget = filteredDeliverySchedules.reduce(
      (sum, schedule) => sum + formatMonthlyScheduleTarget(schedule.targetDeliveryPoints, month, year, schedule.dayOfWeek),
      0,
    );

    return {
      salesCount: filteredSalesTargets.length,
      totalVisitTarget,
      totalSalesTarget,
      totalSalesOrderTarget,
      totalDeliveryTarget,
      totalDeliveryPointTarget,
    };
  }, [filteredSalesTargets, filteredDeliverySchedules, month, year, regionId]);

  function updateSalesTarget(salesTargetId: string, updater: (current: SalesTarget) => SalesTarget) {
    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        salesTargets: current.salesTargets.map((item) => (item.id === salesTargetId ? updater(item) : item)),
      };
    });
  }

  function updateSalesSchedule(
    salesTargetId: string,
    index: number,
    updater: (current: SalesVisitSchedule) => SalesVisitSchedule,
  ) {
    updateSalesTarget(salesTargetId, (current) => ({
      ...current,
      visitSchedules: current.visitSchedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? updater(schedule) : schedule,
      ),
    }));
  }

  function addSalesSchedule(salesTargetId: string) {
    const defaultRegionId = regionId || regions[0]?.id || "";
    updateSalesTarget(salesTargetId, (current) => ({
      ...current,
      visitSchedules: [
        ...current.visitSchedules,
        {
          regionId: defaultRegionId,
          regionName: regions.find((region) => region.id === defaultRegionId)?.name ?? null,
          dayOfWeek: "MONDAY",
          targetVisitCount: 0,
          routeNotes: "",
        },
      ],
    }));
  }

  function removeSalesSchedule(salesTargetId: string, index: number) {
    updateSalesTarget(salesTargetId, (current) => ({
      ...current,
      visitSchedules: current.visitSchedules.filter((_, scheduleIndex) => scheduleIndex !== index),
    }));
  }

  function updateDeliverySchedule(index: number, updater: (current: DeliverySchedule) => DeliverySchedule) {
    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        deliverySchedules: current.deliverySchedules.map((schedule, scheduleIndex) =>
          scheduleIndex === index ? updater(schedule) : schedule,
        ),
      };
    });
  }

  function addDeliverySchedule() {
    const defaultRegionId = regionId || regions[0]?.id || "";
    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        deliverySchedules: [
          ...current.deliverySchedules,
          {
            regionId: defaultRegionId,
            regionName: regions.find((region) => region.id === defaultRegionId)?.name ?? null,
            dayOfWeek: "MONDAY",
            targetDeliveryCount: 0,
            targetDeliveryPoints: 0,
            routeNotes: "",
          },
        ],
      };
    });
  }

  function removeDeliverySchedule(index: number) {
    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        deliverySchedules: current.deliverySchedules.filter((_, scheduleIndex) => scheduleIndex !== index),
      };
    });
  }

  async function handleCreatePeriod() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ data: { id: string } }>("/api/v1/performance-targets", {
        method: "POST",
        body: JSON.stringify({
          month,
          year,
          status: "DRAFT",
          notes: `Target periode ${String(month).padStart(2, "0")}/${year}`,
        }),
      });
      const detailRes = await apiFetch<{ data: PeriodDetail }>(`/api/v1/performance-targets/${res.data.id}`);
      setDetail(normalizePeriodDetail(detailRes.data));
      setMessage("Periode target berhasil dibuat.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Periode target belum berhasil dibuat.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSales() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/performance-targets/${detail.id}/generate-sales`, {
        method: "POST",
        body: JSON.stringify({
          overwriteExisting: false,
        }),
      });
      await loadCurrentPeriod(month, year);
      setMessage("Sales aktif berhasil dimuat ke periode target.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat sales aktif.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyPrevious() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/performance-targets/${detail.id}/copy-from-previous`, {
        method: "POST",
        body: JSON.stringify({
          sourcePeriodKey: getPreviousPeriodKey(month, year),
          copySalesTargets: true,
          copyVisitSchedules: true,
          copyDeliverySchedules: true,
          overwriteExisting: false,
        }),
      });
      await loadCurrentPeriod(month, year);
      setMessage("Target dari bulan sebelumnya berhasil disalin.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyalin target bulan sebelumnya.");
    } finally {
      setSaving(false);
    }
  }

  function validateBeforeSave() {
    if (!detail) return null;

    for (const target of detail.salesTargets) {
      for (const schedule of target.visitSchedules) {
        if (!schedule.regionId) {
          return `Jadwal kunjungan ${target.salesName} masih memiliki wilayah yang kosong.`;
        }
      }
    }

    for (const schedule of detail.deliverySchedules) {
      if (!schedule.regionId) {
        return "Jadwal pengantaran masih memiliki wilayah yang kosong.";
      }
    }

    return null;
  }

  async function handleSaveAll() {
    if (!detail) return;
    const validationError = validateBeforeSave();
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const target of detail.salesTargets) {
        await apiFetch(`/api/v1/performance-targets/${detail.id}/sales-targets/${target.id}`, {
          method: "PUT",
          body: JSON.stringify({
            targetSalesAmount: parseMoneyInput(target.targetSalesAmount),
            targetSalesOrderCount: target.targetSalesOrderCount,
            notes: target.notes ?? "",
          }),
        });

        await apiFetch(`/api/v1/performance-targets/${detail.id}/sales-targets/${target.id}/visit-schedules`, {
          method: "PUT",
          body: JSON.stringify({
            schedules: target.visitSchedules.map((schedule) => ({
              regionId: schedule.regionId,
              dayOfWeek: schedule.dayOfWeek,
              targetVisitCount: schedule.targetVisitCount,
              routeNotes: schedule.routeNotes ?? null,
            })),
          }),
        });
      }

      await apiFetch(`/api/v1/performance-targets/${detail.id}/delivery-schedules`, {
        method: "PUT",
        body: JSON.stringify({
          schedules: detail.deliverySchedules.map((schedule) => ({
            regionId: schedule.regionId,
            dayOfWeek: schedule.dayOfWeek,
            targetDeliveryCount: schedule.targetDeliveryCount,
            targetDeliveryPoints: schedule.targetDeliveryPoints,
            routeNotes: schedule.routeNotes ?? null,
          })),
        }),
      });

      await loadCurrentPeriod(month, year);
      setMessage("Perubahan target berhasil disimpan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan target.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/performance-targets/${detail.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          notes: detail.notes ?? "",
        }),
      });
      await loadCurrentPeriod(month, year);
      setMessage("Periode target berhasil difinalkan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memfinalkan periode target.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenEdit() {
    if (!detail) return;
    const confirmed = window.confirm("Buka kembali periode ini untuk diedit?");
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/performance-targets/${detail.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({
          notes: detail.notes ?? "",
        }),
      });
      await loadCurrentPeriod(month, year);
      setMessage("Periode target dibuka kembali dan dapat diedit.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuka edit periode target.");
    } finally {
      setSaving(false);
    }
  }

  const isLocked = detail?.status === "FINAL";

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h1 className="text-lg font-semibold">Target Kinerja</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Tetapkan target bulanan sales dan jadwal pengantaran operasional per wilayah untuk satu periode.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleGenerateSales} disabled={!detail || saving || isLocked || !canWrite}>
            <Users className="h-4 w-4" />
            Generate Sales
          </Button>
          <Button variant="secondary" onClick={handleCopyPrevious} disabled={!detail || saving || isLocked || !canWrite}>
            <Copy className="h-4 w-4" />
            Salin Bulan Sebelumnya
          </Button>
          <Button variant="secondary" onClick={handleSaveAll} disabled={!detail || saving || isLocked || !canWrite}>
            <Save className="h-4 w-4" />
            {saving ? "Menyimpan..." : "Simpan Draft"}
          </Button>
          {isLocked ? (
            <Button onClick={handleReopenEdit} disabled={!detail || saving || !canFinalize}>
              <LockOpen className="h-4 w-4" />
              Buka Edit
            </Button>
          ) : (
            <Button onClick={handleFinalize} disabled={!detail || saving || !canFinalize}>
              <CheckCircle2 className="h-4 w-4" />
              Finalkan
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Bulan</div>
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {String(value).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <Input label="Tahun" type="number" value={year} onChange={(event) => setYear(Number(event.target.value || getDefaultYear()))} />
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Wilayah</div>
            <select
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Semua Wilayah</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <Input label="Cari Sales" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama sales" />
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => void loadCurrentPeriod(month, year)} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              Muat Ulang
            </Button>
            {!detail ? (
              <Button onClick={handleCreatePeriod} disabled={saving || !canWrite}>
                <Plus className="h-4 w-4" />
                Buat Periode
              </Button>
            ) : null}
          </div>
        </div>
        {detail ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">Periode {detail.periodKey}</span>
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                detail.status === "FINAL" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {formatStatusLabel(detail.status)}
            </span>
            {detail.finalizedAt ? (
              <span className="text-zinc-500">Difinalkan: {formatDateTime(detail.finalizedAt)}</span>
            ) : null}
            {isLocked ? <span className="text-zinc-500">Gunakan `Buka Edit` jika ada revisi setelah final.</span> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-500">
            Periode target belum ada untuk bulan ini. Buat periode terlebih dahulu sebelum menyusun target sales dan jadwal pengantaran.
          </div>
        )}
      </Card>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-6">
        <SummaryCard icon={<Users className="h-5 w-5" />} label="Sales aktif" value={String(summary.salesCount)} />
        <SummaryCard icon={<CalendarDays className="h-5 w-5" />} label="Target kunjungan" value={formatNumber(summary.totalVisitTarget)} />
        <SummaryCard icon={<Target className="h-5 w-5" />} label="Target SO" value={formatNumber(summary.totalSalesOrderTarget)} />
        <SummaryCard icon={<Target className="h-5 w-5" />} label="Target penjualan" value={formatCurrency(summary.totalSalesTarget)} />
        <SummaryCard icon={<Truck className="h-5 w-5" />} label="Target antar" value={formatNumber(summary.totalDeliveryTarget)} />
        <SummaryCard icon={<Truck className="h-5 w-5" />} label="Target titik kirim" value={formatNumber(summary.totalDeliveryPointTarget)} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">Target Sales</div>
          <div className="mt-1 text-sm text-zinc-500">
            Setiap sales memiliki target omzet bulanan, target SO bulanan, dan beberapa jadwal kunjungan per wilayah dan hari.
          </div>
        </div>
        <div className="space-y-4 p-4">
          {filteredSalesTargets.map((target) => (
            <Card key={target.id} className="overflow-hidden border border-zinc-200">
              <div className="border-b border-zinc-200 bg-white px-4 py-3">
                <div className="text-sm font-semibold text-zinc-900">{target.salesName}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Target kunjungan bulanan {formatNumber(
                    target.visitSchedules
                      .filter((schedule) => !regionId || schedule.regionId === regionId)
                      .reduce(
                        (sum, schedule) =>
                          sum + formatMonthlyScheduleTarget(schedule.targetVisitCount, month, year, schedule.dayOfWeek),
                        0,
                      ),
                  )}
                </div>
              </div>
              <div className="grid gap-3 border-b border-zinc-200 p-4 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-500">Target Penjualan Bulanan</div>
                  <input
                    value={target.targetSalesAmount}
                    disabled={Boolean(isLocked) || !canWrite}
                    onChange={(event) =>
                      updateSalesTarget(target.id, (current) => ({
                        ...current,
                        targetSalesAmount: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-right text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-500">Target SO Bulanan</div>
                  <input
                    type="number"
                    min={0}
                    value={target.targetSalesOrderCount}
                    disabled={Boolean(isLocked) || !canWrite}
                    onChange={(event) =>
                      updateSalesTarget(target.id, (current) => ({
                        ...current,
                        targetSalesOrderCount: Number(event.target.value || 0),
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-right text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-500">Catatan</div>
                  <input
                    value={target.notes ?? ""}
                    disabled={Boolean(isLocked) || !canWrite}
                    onChange={(event) =>
                      updateSalesTarget(target.id, (current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
                    placeholder="Catatan target sales"
                  />
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Jadwal Kunjungan Wilayah</div>
                    <div className="mt-1 text-xs text-zinc-500">Masukkan target kunjungan per hari untuk wilayah yang ditugaskan ke sales ini.</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => addSalesSchedule(target.id)}
                    disabled={Boolean(isLocked) || !canWrite}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Jadwal
                  </Button>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <tr className="border-b border-zinc-200">
                        <th className="px-3 py-2 text-left">Wilayah</th>
                        <th className="px-3 py-2 text-left">Hari</th>
                        <th className="px-3 py-2 text-right">Target/Hari</th>
                        <th className="px-3 py-2 text-right">Target/Bulan</th>
                        <th className="px-3 py-2 text-left">Catatan Rute</th>
                        <th className="px-3 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {target.visitSchedules
                        .filter((schedule) => !regionId || schedule.regionId === regionId)
                        .map((schedule, index) => (
                          <tr key={`${target.id}-${index}`} className="border-b border-zinc-100 align-top">
                            <td className="px-3 py-2">
                              <select
                                value={schedule.regionId}
                                disabled={Boolean(isLocked) || !canWrite}
                                onChange={(event) =>
                                  updateSalesSchedule(target.id, index, (current) => ({
                                    ...current,
                                    regionId: event.target.value,
                                    regionName: regions.find((region) => region.id === event.target.value)?.name ?? null,
                                  }))
                                }
                                className="h-10 min-w-[180px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                              >
                                <option value="">Pilih wilayah</option>
                                {regions.map((region) => (
                                  <option key={region.id} value={region.id}>
                                    {region.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={schedule.dayOfWeek}
                                disabled={Boolean(isLocked) || !canWrite}
                                onChange={(event) =>
                                  updateSalesSchedule(target.id, index, (current) => ({
                                    ...current,
                                    dayOfWeek: event.target.value as DayOfWeek,
                                  }))
                                }
                                className="h-10 min-w-[140px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                              >
                                {dayOptions.map((day) => (
                                  <option key={day.value} value={day.value}>
                                    {day.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                value={schedule.targetVisitCount}
                                disabled={Boolean(isLocked) || !canWrite}
                                onChange={(event) =>
                                  updateSalesSchedule(target.id, index, (current) => ({
                                    ...current,
                                    targetVisitCount: Number(event.target.value || 0),
                                  }))
                                }
                                className="h-10 w-28 rounded-lg border border-zinc-200 px-3 text-right text-sm"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-zinc-700">
                              {formatNumber(formatMonthlyScheduleTarget(schedule.targetVisitCount, month, year, schedule.dayOfWeek))}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={schedule.routeNotes ?? ""}
                                disabled={Boolean(isLocked) || !canWrite}
                                onChange={(event) =>
                                  updateSalesSchedule(target.id, index, (current) => ({
                                    ...current,
                                    routeNotes: event.target.value,
                                  }))
                                }
                                className="h-10 min-w-[220px] rounded-lg border border-zinc-200 px-3 text-sm"
                                placeholder="Catatan rute"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeSalesSchedule(target.id, index)}
                                disabled={Boolean(isLocked) || !canWrite}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      {target.visitSchedules.filter((schedule) => !regionId || schedule.regionId === regionId).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-5 text-center text-sm text-zinc-500">
                            Belum ada jadwal kunjungan untuk sales ini pada filter yang dipilih.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))}

          {filteredSalesTargets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
              Belum ada sales target pada filter ini. Gunakan tombol `Generate Sales` untuk memuat sales aktif.
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">Jadwal Pengantaran</div>
          <div className="mt-1 text-sm text-zinc-500">
            Jadwal pengantaran disusun per wilayah dan hari, tanpa assign driver tertentu pada tahap planning.
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">Driver yang bertugas pada hari tersebut akan dinilai dari realisasi delivery aktual.</div>
            <Button size="sm" variant="secondary" onClick={addDeliverySchedule} disabled={Boolean(isLocked) || !canWrite}>
              <Plus className="h-4 w-4" />
              Tambah Jadwal Pengantaran
            </Button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="px-3 py-2 text-left">Wilayah</th>
                  <th className="px-3 py-2 text-left">Hari</th>
                  <th className="px-3 py-2 text-right">Target Antar/Hari</th>
                  <th className="px-3 py-2 text-right">Target Antar/Bulan</th>
                  <th className="px-3 py-2 text-right">Titik Kirim/Hari</th>
                  <th className="px-3 py-2 text-right">Titik Kirim/Bulan</th>
                  <th className="px-3 py-2 text-left">Catatan Rute</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliverySchedules.map((schedule, index) => (
                  <tr key={`delivery-${index}`} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2">
                      <select
                        value={schedule.regionId}
                        disabled={Boolean(isLocked) || !canWrite}
                        onChange={(event) =>
                          updateDeliverySchedule(index, (current) => ({
                            ...current,
                            regionId: event.target.value,
                            regionName: regions.find((region) => region.id === event.target.value)?.name ?? null,
                          }))
                        }
                        className="h-10 min-w-[180px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      >
                        <option value="">Pilih wilayah</option>
                        {regions.map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={schedule.dayOfWeek}
                        disabled={Boolean(isLocked) || !canWrite}
                        onChange={(event) =>
                          updateDeliverySchedule(index, (current) => ({
                            ...current,
                            dayOfWeek: event.target.value as DayOfWeek,
                          }))
                        }
                        className="h-10 min-w-[140px] rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      >
                        {dayOptions.map((day) => (
                          <option key={day.value} value={day.value}>
                            {day.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={schedule.targetDeliveryCount}
                        disabled={Boolean(isLocked) || !canWrite}
                        onChange={(event) =>
                          updateDeliverySchedule(index, (current) => ({
                            ...current,
                            targetDeliveryCount: Number(event.target.value || 0),
                          }))
                        }
                        className="h-10 w-28 rounded-lg border border-zinc-200 px-3 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-700">
                      {formatNumber(formatMonthlyScheduleTarget(schedule.targetDeliveryCount, month, year, schedule.dayOfWeek))}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={schedule.targetDeliveryPoints}
                        disabled={Boolean(isLocked) || !canWrite}
                        onChange={(event) =>
                          updateDeliverySchedule(index, (current) => ({
                            ...current,
                            targetDeliveryPoints: Number(event.target.value || 0),
                          }))
                        }
                        className="h-10 w-28 rounded-lg border border-zinc-200 px-3 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-700">
                      {formatNumber(formatMonthlyScheduleTarget(schedule.targetDeliveryPoints, month, year, schedule.dayOfWeek))}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={schedule.routeNotes ?? ""}
                        disabled={Boolean(isLocked) || !canWrite}
                        onChange={(event) =>
                          updateDeliverySchedule(index, (current) => ({
                            ...current,
                            routeNotes: event.target.value,
                          }))
                        }
                        className="h-10 min-w-[220px] rounded-lg border border-zinc-200 px-3 text-sm"
                        placeholder="Catatan rute"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeDeliverySchedule(index)} disabled={Boolean(isLocked) || !canWrite}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredDeliverySchedules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-5 text-center text-sm text-zinc-500">
                      Belum ada jadwal pengantaran pada filter ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{value}</div>
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 text-zinc-700">{icon}</div>
      </div>
    </Card>
  );
}
