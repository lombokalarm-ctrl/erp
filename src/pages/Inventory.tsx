import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import { apiDownload, apiFetch, ApiError } from "@/api/client";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useAuthStore } from "@/stores/authStore";

type SummaryRow = {
  productId: string;
  sku: string;
  name: string;
  qty: string;
  packSize: number;
  packPerDus: number;
  dusSize: number;
};
type Product = { id: string; sku: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; name: string };

type TransactionRow = {
  id: string;
  type: string;
  qtyDelta: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  warehouseCode: string;
  sku: string;
  productName: string;
};

type ReplenishmentItem = {
  productId: string;
  sku: string;
  productName: string;
  purchasePrice: string;
  currentQtyBase: string;
  minStockBase: string;
  reorderQtyBase: string;
  leadTimeDays: number;
  bufferDays: number;
  avgDailySalesBase: string;
  targetStockBase: string;
  shortageQtyBase: string;
  recommendedQtyBase: string;
  estimatedPurchaseValue: string;
};

type TransferRow = {
  id: string;
  transferNo: string;
  transferDate: string;
  sourceWarehouseCode: string;
  targetWarehouseCode: string;
  totalQtyBase: string;
  itemCount: number;
  createdAt: string;
};

type TransferApprovalRow = {
  approvalId: string;
  level: number;
  approvalStatus: string;
  requestId: string;
  requestNo: string;
  requestStatus: string;
  transferDate: string;
  requestNote?: string;
  sourceWarehouseCode: string;
  targetWarehouseCode: string;
  requestedByName?: string;
  requestedAt: string;
  totalQtyBase: string;
  itemCount: number;
};

export default function Inventory() {
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const canApproveTransfer = hasAnyPermission(["inventory:approve_level1", "inventory:approve_level2"]);

  const [activeTab, setActiveTab] = useState<"summary" | "transactions" | "replenishment" | "transfer">("summary");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [txRows, setTxRows] = useState<TransactionRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [qtyDelta, setQtyDelta] = useState("0");
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const canAdjust = useMemo(() => productId && Number(qtyDelta) !== 0, [productId, qtyDelta]);
  const [replenishmentRows, setReplenishmentRows] = useState<ReplenishmentItem[]>([]);
  const [replenishmentQ, setReplenishmentQ] = useState("");
  const [replenishmentWarehouseId, setReplenishmentWarehouseId] = useState("");
  const [replenishmentLookbackDays, setReplenishmentLookbackDays] = useState("30");
  const [selectedReplenishmentProductIds, setSelectedReplenishmentProductIds] = useState<string[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [autoBySupplier, setAutoBySupplier] = useState(true);
  const [poOrderDate, setPoOrderDate] = useState(new Date().toISOString().slice(0, 10));

  const [transferSourceWarehouseId, setTransferSourceWarehouseId] = useState("");
  const [transferTargetWarehouseId, setTransferTargetWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [transferClientRef, setTransferClientRef] = useState("");
  const [transferItems, setTransferItems] = useState<Array<{ productId: string; qtyBase: string }>>([
    { productId: "", qtyBase: "0" },
  ]);
  const [transferRows, setTransferRows] = useState<TransferRow[]>([]);
  const [transferApprovals, setTransferApprovals] = useState<TransferApprovalRow[]>([]);

  async function load() {
    setError(null);
    try {
      const [s, p, tx, wh, sp] = await Promise.all([
        apiFetch<{ data: SummaryRow[] }>(`/api/v1/inventory/summary?q=${encodeURIComponent(q)}`),
        apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
        apiFetch<{ data: TransactionRow[] }>("/api/v1/inventory/transactions?page=1&pageSize=100"),
        apiFetch<{ data: Warehouse[] }>("/api/v1/warehouses?page=1&pageSize=200"),
        apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      ]);
      setRows(s.data);
      setProducts(p.data);
      setTxRows(tx.data);
      setWarehouses(wh.data);
      setSuppliers(sp.data);
      if (!selectedSupplierId && sp.data[0]?.id) setSelectedSupplierId(sp.data[0].id);
      if (!transferSourceWarehouseId && wh.data[0]?.id) setTransferSourceWarehouseId(wh.data[0].id);
      if (!transferTargetWarehouseId && wh.data[1]?.id) setTransferTargetWarehouseId(wh.data[1].id);
      if (!productId && p.data[0]?.id) setProductId(p.data[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  async function loadReplenishment() {
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (replenishmentWarehouseId) qs.set("warehouseId", replenishmentWarehouseId);
      if (replenishmentQ.trim()) qs.set("q", replenishmentQ.trim());
      qs.set("lookbackDays", String(Math.max(1, Number(replenishmentLookbackDays || 30))));
      const path = `/api/v1/inventory/replenishment/suggestions${qs.toString() ? `?${qs.toString()}` : ""}`;
      const res = await apiFetch<{ data: { items: ReplenishmentItem[] } }>(path);
      const items = res.data.items || [];
      setReplenishmentRows(items);
      setSelectedReplenishmentProductIds((prev) => prev.filter((id) => items.some((r) => r.productId === id)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat rekomendasi replenishment");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeTab === "replenishment") {
      void loadReplenishment();
    }
    if (activeTab === "transfer") {
      void loadTransfers();
      void loadTransferApprovals();
    }
  }, [activeTab, canApproveTransfer]);

  async function handleCreateDraftPo(mode: "manual" | "auto") {
    try {
      setError(null);
      await apiFetch("/api/v1/inventory/replenishment/draft-po", {
        method: "POST",
        body: JSON.stringify({
          supplierId: mode === "manual" ? selectedSupplierId : undefined,
          fallbackSupplierId: mode === "auto" ? selectedSupplierId || undefined : undefined,
          autoBySupplier: mode === "auto",
          orderDate: poOrderDate,
          warehouseId: replenishmentWarehouseId || undefined,
          q: replenishmentQ || undefined,
          lookbackDays: Math.max(1, Number(replenishmentLookbackDays || 30)),
          productIds: selectedReplenishmentProductIds.length ? selectedReplenishmentProductIds : undefined,
        }),
      });
      await loadReplenishment();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membuat draft PO");
    }
  }

  async function handleExportReplenishment(format: "xlsx" | "pdf") {
    try {
      setError(null);
      const url = new URL("/api/v1/exports/replenishment", window.location.origin);
      url.searchParams.set("format", format);
      if (replenishmentWarehouseId) url.searchParams.set("warehouseId", replenishmentWarehouseId);
      if (replenishmentQ.trim()) url.searchParams.set("q", replenishmentQ.trim());
      url.searchParams.set("lookbackDays", String(Math.max(1, Number(replenishmentLookbackDays || 30))));
      const file = await apiDownload(url.pathname + url.search);
      const blobUrl = URL.createObjectURL(file.blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal export replenishment");
    }
  }

  async function loadTransfers() {
    try {
      const res = await apiFetch<{ data: TransferRow[] }>("/api/v1/inventory/transfers?page=1&pageSize=100");
      setTransferRows(res.data || []);
    } catch {
      setTransferRows([]);
    }
  }

  async function loadTransferApprovals() {
    if (!canApproveTransfer) {
      setTransferApprovals([]);
      return;
    }
    try {
      const res = await apiFetch<{ data: TransferApprovalRow[] }>(
        "/api/v1/inventory/transfers/approvals?page=1&pageSize=100&status=PENDING",
      );
      setTransferApprovals(res.data || []);
    } catch {
      setTransferApprovals([]);
    }
  }

  async function handleExportTransfers(format: "xlsx" | "pdf") {
    try {
      setError(null);
      const url = new URL("/api/v1/exports/inventory-transfers", window.location.origin);
      url.searchParams.set("format", format);
      const file = await apiDownload(url.pathname + url.search);
      const blobUrl = URL.createObjectURL(file.blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal export transfer gudang");
    }
  }

  async function handleSaveTransfer() {
    try {
      setError(null);
      const items = transferItems
        .map((it) => ({ productId: it.productId, qtyBase: Number(it.qtyBase || 0) }))
        .filter((it) => it.productId && it.qtyBase > 0);
      if (!items.length) {
        setError("Item transfer belum valid");
        return;
      }
      await apiFetch("/api/v1/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({
          sourceWarehouseId: transferSourceWarehouseId,
          targetWarehouseId: transferTargetWarehouseId,
          transferDate,
          clientRef: transferClientRef.trim() || undefined,
          items,
        }),
      });
      setTransferClientRef("");
      setTransferItems([{ productId: "", qtyBase: "0" }]);
      await loadTransferApprovals();
      await loadTransfers();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan transfer gudang");
    }
  }

  async function handleProcessTransferApproval(approvalId: string, action: "APPROVED" | "REJECTED") {
    if (!confirm(`Apakah Anda yakin ingin ${action === "APPROVED" ? "MENYETUJUI" : "MENOLAK"} request transfer ini?`)) {
      return;
    }
    try {
      setError(null);
      await apiFetch(`/api/v1/inventory/transfers/approvals/${approvalId}/process`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await loadTransferApprovals();
      await loadTransfers();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memproses approval transfer");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-600">Stok ringkas, penyesuaian stok, dan riwayat pergerakan stok (Kartu Stok).</p>
        </div>
        {activeTab === "summary" && (
          <div className="flex gap-2">
            <div className="w-full md:w-72">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SKU / nama..." />
            </div>
            <Button variant="secondary" onClick={load}>
              Cari
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("summary")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "summary"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Stok Ringkas
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "transactions"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Kartu Stok (Riwayat)
          </button>
          <button
            onClick={() => setActiveTab("replenishment")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "replenishment"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Replenishment
          </button>
          <button
            onClick={() => setActiveTab("transfer")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "transfer"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            Transfer Gudang
          </button>
        </nav>
      </div>

      {activeTab === "summary" ? (
        <div>
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
            <span>Stok Ringkas</span>
            <Button
              size="sm"
              onClick={() => {
                setQtyDelta("0");
                setError(null);
                setIsAdjustmentOpen(true);
              }}
            >
              Stock Adjustment
            </Button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2 text-right">Stok Total (Pcs)</th>
                  <th className="px-4 py-2 text-right">Stok (Dus, Pack, Pcs)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const qtyPcs = Math.trunc(Number(r.qty) || 0);
                  const packPcs = Math.max(1, Number(r.packSize) || 1);
                  const dusPcs =
                    Math.max(1, Number(r.dusSize) || 0) ||
                    Math.max(1, (Number(r.packPerDus) || 1) * packPcs);
                  const dus = Math.floor(qtyPcs / dusPcs);
                  const rem1 = qtyPcs % dusPcs;
                  const pack = Math.floor(rem1 / packPcs);
                  const pcs = rem1 % packPcs;

                  let formattedStock = [];
                  if (dus > 0) formattedStock.push(`${dus} Dus`);
                  if (pack > 0) formattedStock.push(`${pack} Pack`);
                  if (pcs > 0 || formattedStock.length === 0) formattedStock.push(`${pcs} Pcs`);

                  return (
                    <tr key={r.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium">{r.sku}</td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right font-medium">{qtyPcs}</td>
                      <td className="px-4 py-2 text-right text-zinc-600">{formattedStock.join(', ')}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
          {isAdjustmentOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
              <Card className="w-full max-w-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold">Stock Adjustment</div>
                    <p className="text-xs text-zinc-500">Masukkan perubahan stok untuk koreksi data persediaan.</p>
                  </div>
                  <button
                    className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                    onClick={() => setIsAdjustmentOpen(false)}
                  >
                    Tutup
                  </button>
                </div>
                <div className="mt-1 text-sm text-zinc-600">Qty Delta bisa positif (masuk) atau negatif (keluar).</div>
                <div className="mt-3 grid gap-3">
                  <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">Produk</div>
                    <SearchableSelect
                      value={productId}
                      onChange={setProductId}
                      includePlaceholder={false}
                      searchPlaceholder="Cari SKU / nama produk..."
                      options={products.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                    />
                  </label>
                  <NumericInput
                    label="Qty Delta"
                    value={qtyDelta}
                    allowNegative
                    onValueChange={(v) => setQtyDelta(v || "0")}
                  />
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setIsAdjustmentOpen(false)}>
                      Batal
                    </Button>
                    <Button
                      disabled={!canAdjust}
                      onClick={async () => {
                        setError(null);
                        try {
                          await apiFetch("/api/v1/inventory/adjustments", {
                            method: "POST",
                            body: JSON.stringify({ productId, qtyDelta: Number(qtyDelta) }),
                          });
                          setQtyDelta("0");
                          setIsAdjustmentOpen(false);
                          await load();
                        } catch (e) {
                          setError(e instanceof ApiError ? e.message : "Gagal melakukan adjustment");
                        }
                      }}
                    >
                      Simpan Adjustment
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
      </div>
      ) : activeTab === "transactions" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-3">Tanggal & Waktu</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3">Tipe Transaksi</th>
                  <th className="px-4 py-3 text-right">Perubahan Qty</th>
                  <th className="px-4 py-3">Referensi</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2">{new Date(t.createdAt).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-2 font-medium">
                      <div className="text-zinc-900">{t.sku}</div>
                      <div className="text-xs text-zinc-500 font-normal">{t.productName}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800">
                        {t.type}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(t.qtyDelta) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {Number(t.qtyDelta) > 0 ? "+" : ""}{t.qtyDelta}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {t.refType ? `${t.refType} #${t.refId?.slice(0,8)}` : "-"}
                    </td>
                  </tr>
                ))}
                {txRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Belum ada riwayat transaksi stok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === "replenishment" ? (
        <div className="space-y-3">
          <Card className="p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Input
                  value={replenishmentQ}
                  onChange={(e) => setReplenishmentQ(e.target.value)}
                  placeholder="Cari SKU / produk..."
                />
              </div>
              <div>
                <SearchableSelect
                  value={replenishmentWarehouseId}
                  onChange={setReplenishmentWarehouseId}
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                  placeholder="Semua Gudang"
                  searchPlaceholder="Cari gudang..."
                />
              </div>
              <div>
                <NumericInput
                  label="Lookback (hari)"
                  value={replenishmentLookbackDays}
                  onValueChange={(v) => setReplenishmentLookbackDays(v || "30")}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void loadReplenishment()}>
                  Muat
                </Button>
                <Button variant="secondary" onClick={() => void handleExportReplenishment("xlsx")}>Excel</Button>
                <Button variant="secondary" onClick={() => void handleExportReplenishment("pdf")}>PDF</Button>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Supplier Draft PO</div>
                <SearchableSelect
                  value={selectedSupplierId}
                  onChange={setSelectedSupplierId}
                  includePlaceholder={false}
                  options={suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
                  searchPlaceholder="Cari supplier..."
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Tanggal PO</div>
                <Input type="date" value={poOrderDate} onChange={(e) => setPoOrderDate(e.target.value)} />
              </label>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" checked={autoBySupplier} onChange={(e) => setAutoBySupplier(e.target.checked)} />
                  Auto by supplier
                </label>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="secondary" onClick={() => void handleCreateDraftPo("manual")} disabled={!selectedSupplierId}>
                  Draft PO Manual
                </Button>
                <Button onClick={() => void handleCreateDraftPo("auto")} disabled={!selectedSupplierId && autoBySupplier}>
                  Auto Draft PO
                </Button>
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {autoBySupplier
                ? "Mode auto: sistem kelompokkan rekomendasi per supplier berdasarkan histori PO, supplier dipilih jadi fallback."
                : "Mode manual: semua item diproses ke satu supplier terpilih."}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-2">Pilih</th>
                    <th className="px-4 py-2">SKU</th>
                    <th className="px-4 py-2">Nama Produk</th>
                    <th className="px-4 py-2 text-right">Stok Saat Ini (Base)</th>
                    <th className="px-4 py-2 text-right">Min Stock</th>
                    <th className="px-4 py-2 text-right">Lead Time</th>
                    <th className="px-4 py-2 text-right">Buffer</th>
                    <th className="px-4 py-2 text-right">Avg Sales</th>
                    <th className="px-4 py-2 text-right">Target Stock</th>
                    <th className="px-4 py-2 text-right">Kekurangan</th>
                    <th className="px-4 py-2 text-right">Rekomendasi PO</th>
                    <th className="px-4 py-2 text-right">Estimasi Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishmentRows.map((r) => (
                    <tr key={r.productId} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedReplenishmentProductIds.includes(r.productId)}
                          onChange={(e) => {
                            setSelectedReplenishmentProductIds((prev) =>
                              e.target.checked ? [...prev, r.productId] : prev.filter((id) => id !== r.productId),
                            );
                          }}
                        />
                      </td>
                      <td className="px-4 py-2 font-medium">{r.sku}</td>
                      <td className="px-4 py-2">{r.productName}</td>
                      <td className="px-4 py-2 text-right">{Number(r.currentQtyBase).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.minStockBase).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.leadTimeDays || 0)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.bufferDays || 0)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.avgDailySalesBase || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.targetStockBase || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-red-600">{Number(r.shortageQtyBase).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">{Number(r.recommendedQtyBase).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{Number(r.estimatedPurchaseValue).toFixed(2)}</td>
                    </tr>
                  ))}
                  {replenishmentRows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-zinc-500">
                        Tidak ada alert min stock.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Gudang Asal</div>
                <SearchableSelect
                  value={transferSourceWarehouseId}
                  onChange={setTransferSourceWarehouseId}
                  includePlaceholder={false}
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                  searchPlaceholder="Cari gudang asal..."
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Gudang Tujuan</div>
                <SearchableSelect
                  value={transferTargetWarehouseId}
                  onChange={setTransferTargetWarehouseId}
                  includePlaceholder={false}
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                  searchPlaceholder="Cari gudang tujuan..."
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Tanggal Transfer</div>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Client Ref (opsional)</div>
                <Input
                  value={transferClientRef}
                  onChange={(e) => setTransferClientRef(e.target.value)}
                  placeholder="Mis. mobile-sync-001"
                />
              </label>
            </div>
          </Card>
          <Card className="p-3">
            <div className="space-y-2">
              {transferItems.map((it, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                  <SearchableSelect
                    value={it.productId}
                    onChange={(v) =>
                      setTransferItems((prev) => prev.map((row, i) => (i === idx ? { ...row, productId: v } : row)))
                    }
                    options={products.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                    searchPlaceholder="Cari produk..."
                    includePlaceholder={false}
                  />
                  <NumericInput
                    label="Qty Base"
                    value={it.qtyBase}
                    onValueChange={(v) =>
                      setTransferItems((prev) => prev.map((row, i) => (i === idx ? { ...row, qtyBase: v || "0" } : row)))
                    }
                  />
                  <div className="flex items-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setTransferItems((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={transferItems.length === 1}
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setTransferItems((prev) => [...prev, { productId: "", qtyBase: "0" }])}
              >
                Tambah Item
              </Button>
              <Button onClick={() => void handleSaveTransfer()}>Ajukan Transfer</Button>
              <Button variant="secondary" onClick={() => void handleExportTransfers("xlsx")}>Excel Transfer</Button>
              <Button variant="secondary" onClick={() => void handleExportTransfers("pdf")}>PDF Transfer</Button>
            </div>
          </Card>
          {canApproveTransfer ? (
            <Card className="overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
                Antrean Approval Transfer (2-Level)
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                      <th className="px-4 py-2">No Request</th>
                      <th className="px-4 py-2">Level</th>
                      <th className="px-4 py-2">Tanggal</th>
                      <th className="px-4 py-2">Asal</th>
                      <th className="px-4 py-2">Tujuan</th>
                      <th className="px-4 py-2 text-right">Item</th>
                      <th className="px-4 py-2 text-right">Qty Base</th>
                      <th className="px-4 py-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferApprovals.map((row) => (
                      <tr key={row.approvalId} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-2 font-medium">{row.requestNo}</td>
                        <td className="px-4 py-2">L{row.level}</td>
                        <td className="px-4 py-2">{row.transferDate}</td>
                        <td className="px-4 py-2">{row.sourceWarehouseCode}</td>
                        <td className="px-4 py-2">{row.targetWarehouseCode}</td>
                        <td className="px-4 py-2 text-right">{Number(row.itemCount || 0)}</td>
                        <td className="px-4 py-2 text-right">{Number(row.totalQtyBase || 0).toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => void handleProcessTransferApproval(row.approvalId, "APPROVED")}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleProcessTransferApproval(row.approvalId, "REJECTED")}
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {transferApprovals.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-zinc-500" colSpan={8}>
                          Tidak ada antrean approval transfer.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-4 py-2">No Transfer</th>
                    <th className="px-4 py-2">Tanggal</th>
                    <th className="px-4 py-2">Gudang Asal</th>
                    <th className="px-4 py-2">Gudang Tujuan</th>
                    <th className="px-4 py-2 text-right">Item</th>
                    <th className="px-4 py-2 text-right">Total Qty Base</th>
                  </tr>
                </thead>
                <tbody>
                  {transferRows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium">{row.transferNo}</td>
                      <td className="px-4 py-2">{row.transferDate}</td>
                      <td className="px-4 py-2">{row.sourceWarehouseCode}</td>
                      <td className="px-4 py-2">{row.targetWarehouseCode}</td>
                      <td className="px-4 py-2 text-right">{Number(row.itemCount || 0)}</td>
                      <td className="px-4 py-2 text-right">{Number(row.totalQtyBase || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {transferRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-zinc-500" colSpan={6}>
                        Belum ada dokumen transfer gudang.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
