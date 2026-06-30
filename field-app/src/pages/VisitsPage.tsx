import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, ClipboardCheck, ImagePlus, LoaderCircle, LocateFixed, MapPinned, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import SurfaceCard from "@/components/SurfaceCard";
import { formatDateTime, generateLocalId } from "@/lib/format";
import { useFieldStore } from "@/stores/fieldStore";
import type { VisitDraft } from "@/stores/fieldStore";

type Customer = {
  id: string;
  name: string;
  code: string;
  regionName?: string | null;
};

const visitOptions = [
  { value: "OPEN", label: "Toko buka" },
  { value: "CLOSED", label: "Toko tutup" },
  { value: "NOT_FOUND", label: "Tidak ditemukan" },
  { value: "FOLLOW_UP", label: "Perlu follow up" },
] as const;

const MAX_PHOTOS = 3;

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Browser ini belum mendukung geolokasi."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal memproses foto."));
    image.src = src;
  });
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function buildWatermarkLines(params: {
  customerLabel: string;
  location: NonNullable<VisitDraft["location"]>;
  capturedAt: string;
}) {
  const { customerLabel, location, capturedAt } = params;
  return [
    `Pelanggan: ${customerLabel}`,
    `Lat ${location.latitude.toFixed(6)} | Lng ${location.longitude.toFixed(6)}`,
    `Akurasi ${location.accuracy ? `${Math.round(location.accuracy)} m` : "-"}`,
    `Waktu ${formatDateTime(capturedAt)}`,
  ];
}

async function createPhotoPreview(params: {
  file: File;
  location: NonNullable<VisitDraft["location"]>;
  customerLabel: string;
  capturedAt: string;
}) {
  const { file, location, customerLabel, capturedAt } = params;
  const source = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(source);
    const longestSide = Math.max(image.width, image.height);
    const scale = longestSide > 1280 ? 1280 / longestSide : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return source;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const boxPaddingX = Math.max(16, Math.round(canvas.width * 0.024));
    const boxPaddingY = Math.max(12, Math.round(canvas.height * 0.018));
    const lineHeight = Math.max(18, Math.round(canvas.height * 0.035));
    const maxTextWidth = canvas.width - boxPaddingX * 2;
    const watermarkLines = buildWatermarkLines({ customerLabel, location, capturedAt }).flatMap((line) =>
      wrapText(context, line, maxTextWidth),
    );
    const boxHeight = boxPaddingY * 2 + watermarkLines.length * lineHeight;
    const boxY = canvas.height - boxHeight;

    context.fillStyle = "rgba(15, 23, 42, 0.78)";
    context.fillRect(0, boxY, canvas.width, boxHeight);
    context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    context.lineWidth = 1;
    context.strokeRect(0.5, boxY + 0.5, canvas.width - 1, boxHeight - 1);

    context.fillStyle = "#ffffff";
    context.font = `600 ${Math.max(12, Math.round(canvas.width * 0.024))}px Outfit, Segoe UI, sans-serif`;
    context.textBaseline = "top";

    watermarkLines.forEach((line, index) => {
      context.fillText(line, boxPaddingX, boxY + boxPaddingY + index * lineHeight);
    });

    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return source;
  }
}

function formatVisitStatusLabel(status: VisitDraft["visitStatus"]) {
  return visitOptions.find((item) => item.value === status)?.label ?? status;
}

function formatSyncStatusLabel(status: VisitDraft["status"]) {
  switch (status) {
    case "SYNCED":
      return "Sudah sinkron";
    case "FAILED":
      return "Gagal sinkron";
    case "LOCAL_ONLY":
      return "Lokal saja";
    default:
      return "Siap disinkron";
  }
}

export default function VisitsPage() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [visitStatus, setVisitStatus] = useState<(typeof visitOptions)[number]["value"]>("OPEN");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [location, setLocation] = useState<VisitDraft["location"]>(null);
  const [photos, setPhotos] = useState<VisitDraft["photos"]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const visitDrafts = useFieldStore((state) => state.visitDrafts);
  const addVisitDraft = useFieldStore((state) => state.addVisitDraft);
  const removeVisitDraft = useFieldStore((state) => state.removeVisitDraft);

  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === customerId) ?? null,
    [customerId, customers],
  );

  useEffect(() => {
    let active = true;
    apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=50&includeUnassigned=true")
      .then((response) => {
        if (!active) return;
        setCustomers(response.data);
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Daftar pelanggan belum bisa dimuat. Anda masih bisa melihat draft kunjungan yang sudah tersimpan.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextCustomerId = searchParams.get("customerId");
    if (nextCustomerId) {
      setCustomerId(nextCustomerId);
    }
  }, [searchParams]);

  async function handleCaptureLocation() {
    setIsLocating(true);
    setMessage(null);
    try {
      const result = await getCurrentPosition();
      setLocation({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null,
        capturedAt: new Date().toISOString(),
      });
      setMessage({ tone: "success", text: "Lokasi berhasil ditangkap dari perangkat." });
    } catch (error) {
      const fallback =
        error instanceof GeolocationPositionError
          ? "Izin lokasi ditolak atau sinyal GPS belum stabil."
          : error instanceof Error
            ? error.message
            : "Lokasi tidak berhasil diambil.";
      setMessage({ tone: "error", text: fallback });
    } finally {
      setIsLocating(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedFiles.length) return;

    if (!location) {
      setMessage({ tone: "error", text: "Ambil lokasi terlebih dahulu agar foto bisa diberi watermark geotag." });
      return;
    }

    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setMessage({ tone: "error", text: `Maksimal ${MAX_PHOTOS} foto per kunjungan.` });
      return;
    }

    setIsProcessingPhotos(true);
    setMessage(null);
    try {
      const nextPhotos = await Promise.all(
        selectedFiles.slice(0, remainingSlots).map(async (file) => {
          const capturedAt = new Date().toISOString();
          return {
            id: generateLocalId("photo"),
            name: file.name,
            previewUrl: await createPhotoPreview({
              file,
              location,
              customerLabel: selectedCustomer ? `${selectedCustomer.code} - ${selectedCustomer.name}` : "Pelanggan",
              capturedAt,
            }),
            capturedAt,
          };
        }),
      );
      setPhotos((current) => [...nextPhotos, ...current]);
      setMessage({ tone: "success", text: `${nextPhotos.length} foto berhasil ditambahkan dengan watermark geotag.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Foto belum berhasil diproses.",
      });
    } finally {
      setIsProcessingPhotos(false);
    }
  }

  function handleRemovePhoto(photoId: string) {
    setPhotos((current) => current.filter((item) => item.id !== photoId));
  }

  function handleSaveVisit() {
    setMessage(null);
    if (!customerId) {
      setMessage({ tone: "error", text: "Pilih pelanggan terlebih dahulu." });
      return;
    }
    if (!location) {
      setMessage({ tone: "error", text: "Ambil tag lokasi sebelum menyimpan kunjungan." });
      return;
    }
    if (!photos.length) {
      setMessage({ tone: "error", text: "Tambahkan minimal satu foto kunjungan." });
      return;
    }
    addVisitDraft({
      localId: generateLocalId("visit"),
      customerId,
      customerName: selectedCustomer?.name ?? "Pelanggan",
      customerCode: selectedCustomer?.code ?? "-",
      visitStatus,
      note,
      visitedAt: new Date().toISOString(),
      location,
      photos,
      status: "PENDING_SYNC",
    });
    setCustomerId("");
    setNote("");
    setVisitStatus("OPEN");
    setLocation(null);
    setPhotos([]);
    setMessage({ tone: "success", text: "Kunjungan tersimpan lokal dan siap disinkron nanti." });
  }

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Kunjungan Toko</div>
            <div className="mt-1 text-sm text-zinc-500">
              Catat kunjungan lengkap dengan foto dan tag lokasi, tetap aman walau koneksi belum stabil.
            </div>
          </div>
          <MapPinned className="h-6 w-6 text-emerald-700" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">Tag Lokasi</div>
            <div className="mt-2 text-sm font-medium text-emerald-950">{location ? "Siap" : "Belum diambil"}</div>
          </div>
          <div className="rounded-[22px] border border-amber-100 bg-amber-50 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-amber-700">Foto Kunjungan</div>
            <div className="mt-2 text-sm font-medium text-amber-950">
              {photos.length ? `${photos.length} foto tersimpan` : "Belum ada foto"}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {loadError ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {loadError}
            </div>
          ) : null}
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="field-input">
            <option value="">Pilih pelanggan</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} - {customer.name}
                {customer.regionName ? ` (${customer.regionName})` : ""}
              </option>
            ))}
          </select>
          {selectedCustomer ? (
            <div className="rounded-[22px] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <div className="font-medium text-zinc-900">{selectedCustomer.code} - {selectedCustomer.name}</div>
              <div className="mt-1 text-zinc-500">Pelanggan ini akan dipakai sebagai tujuan kunjungan.</div>
            </div>
          ) : null}
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
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={handleCaptureLocation} className="secondary-button" disabled={isLocating}>
              {isLocating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {isLocating ? "Mengambil..." : "Ambil Lokasi"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="secondary-button"
              disabled={isProcessingPhotos || photos.length >= MAX_PHOTOS || !location}
            >
              {isProcessingPhotos ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {isProcessingPhotos ? "Memproses..." : "Buka Kamera"}
            </button>
          </div>
          <div className="rounded-[22px] border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Foto diambil dari kamera HP dan otomatis diberi watermark geotag berisi pelanggan, koordinat, akurasi, dan waktu.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotoChange}
          />
          {location ? (
            <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-950">
                <LocateFixed className="h-4 w-4" />
                Tag lokasi tersimpan
              </div>
              <div className="mt-2 text-zinc-700">
                Lat {location.latitude.toFixed(6)} • Lng {location.longitude.toFixed(6)}
              </div>
              <div className="mt-1 text-zinc-500">
                Akurasi {location.accuracy ? `${Math.round(location.accuracy)} m` : "-"} • {formatDateTime(location.capturedAt)}
              </div>
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-sm font-medium text-emerald-700"
              >
                Buka di peta
              </a>
            </div>
          ) : null}
          {photos.length ? (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="relative overflow-hidden rounded-[22px] border border-zinc-200 bg-white">
                  <img src={photo.previewUrl} alt={photo.name} className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id)}
                    className="absolute right-2 top-2 rounded-full bg-black/65 p-2 text-white"
                    aria-label={`Hapus ${photo.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="space-y-1 px-3 py-2">
                    <div className="line-clamp-1 text-sm font-medium text-zinc-900">{photo.name}</div>
                    <div className="text-xs text-zinc-500">{formatDateTime(photo.capturedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center text-sm text-zinc-500">
              Ambil sampai {MAX_PHOTOS} foto kunjungan dari kamera HP. Setiap foto akan diberi watermark geotag otomatis.
            </div>
          )}
          <button type="button" onClick={handleSaveVisit} className="primary-button">
            <ClipboardCheck className="h-4 w-4" />
            Simpan Kunjungan Lokal
          </button>
          {message ? (
            <div
              className={`rounded-[22px] px-4 py-3 text-sm ${
                message.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {message.text}
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Draft Kunjungan</div>
            <div className="text-sm text-zinc-500">Semua visit lokal yang siap disinkron akan muncul di sini.</div>
          </div>
          <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
            {visitDrafts.length} draft
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {visitDrafts.length ? (
            visitDrafts.map((visit) => (
              <div key={visit.localId} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">
                      {visit.customerCode ? `${visit.customerCode} - ` : ""}
                      {visit.customerName}
                    </div>
                    <div className="text-sm text-zinc-500">{formatDateTime(visit.visitedAt)}</div>
                  </div>
                  <button type="button" className="text-sm text-rose-600" onClick={() => removeVisitDraft(visit.localId)}>
                    Hapus
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {formatVisitStatusLabel(visit.visitStatus)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                    {formatSyncStatusLabel(visit.status)}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    {visit.photos.length} foto
                  </span>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    {visit.location ? "Tag lokasi ada" : "Tanpa lokasi"}
                  </span>
                </div>
                <div className="mt-3 text-sm text-zinc-700">{visit.note || "-"}</div>
                {visit.location ? (
                  <div className="mt-3 rounded-[18px] bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                    Lat {visit.location.latitude.toFixed(6)} • Lng {visit.location.longitude.toFixed(6)} • Akurasi{" "}
                    {visit.location.accuracy ? `${Math.round(visit.location.accuracy)} m` : "-"}
                  </div>
                ) : null}
                {visit.photos.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {visit.photos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.previewUrl}
                        alt={photo.name}
                        className="h-20 w-full rounded-2xl object-cover"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState
              title="Belum ada draft kunjungan"
              description="Draft dengan foto dan tag lokasi akan tampil di sini sebelum disinkron."
            />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
