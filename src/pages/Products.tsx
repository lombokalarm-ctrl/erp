import { useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { fetchActiveUoms } from "@/lib/uom";
import { exportToExcel } from "@/lib/exportUtils";
import { formatCurrency } from "@/lib/numberFormat";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isActive: boolean;
  supplierId?: string | null;
  supplierName?: string | null;
  purchasePrice: string;
  salePrice: string;
  categoryPrices?: Record<string, Record<string, number>>;
  unitPrices?: Record<string, number>;
  packSize?: number;
  packPerDus?: number;
  dusSize?: number;
  minStockBase?: string;
  reorderQtyBase?: string;
};

type SupplierOption = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
};

type UomMaster = {
  code: string;
  name: string;
};

type ProductUomMapping = {
  uomCode: string;
  toBaseFactor: string;
  isSale: boolean;
  isPurchase: boolean;
  isDefaultSale: boolean;
  isDefaultPurchase: boolean;
};

type ProductImportSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors?: { row: number; message: string; sku?: string }[];
};

type ProductListResponse = {
  data: Product[];
  meta?: {
    total?: number;
  };
};

const CUSTOMER_CATEGORIES = [
  "RETAIL",
  "GROSIR",
  "MODERN RETAIL",
  "HOREKA",
  "NASIONAL MODERN RETAIL",
];

export default function Products() {
  const skuInputId = "product-form-sku";
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"true" | "false" | "all">("true");
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ProductImportSummary | null>(null);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [supplierId, setSupplierId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [minStockBase, setMinStockBase] = useState("0");
  const [reorderQtyBase, setReorderQtyBase] = useState("0");
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({ pcs: "0" });
  const [categoryPrices, setCategoryPrices] = useState<Record<string, Record<string, string>>>(
    CUSTOMER_CATEGORIES.reduce(
      (acc, cat) => ({ ...acc, [cat]: { pcs: "0" } }),
      {} as Record<string, Record<string, string>>,
    ),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [uomMaster, setUomMaster] = useState<UomMaster[]>([]);
  const [mappingModalProduct, setMappingModalProduct] = useState<Product | null>(null);
  const [uomMappings, setUomMappings] = useState<ProductUomMapping[]>([]);
  const [editingMappings, setEditingMappings] = useState<ProductUomMapping[]>([]);
  const [isMappingInlineOpen, setIsMappingInlineOpen] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canCreate = useMemo(() => sku.trim() && name.trim(), [sku, name]);
  const activePriceUoms = useMemo(() => {
    const source = editingMappings.filter((m) => m.isSale);
    if (!source.length) return [unit || "pcs"];
    return Array.from(new Set(source.map((m) => m.uomCode))).filter(Boolean);
  }, [editingMappings, unit]);

  function emptyCategoryPrices(uomCodes: string[]) {
    return CUSTOMER_CATEGORIES.reduce(
      (acc, cat) => ({
        ...acc,
        [cat]: uomCodes.reduce((uAcc, code) => ({ ...uAcc, [code]: "0" }), {} as Record<string, string>),
      }),
      {} as Record<string, Record<string, string>>,
    );
  }

  function mergeCategoryPrices(
    source: Record<string, Record<string, number | string>> | undefined,
    uomCodes: string[],
  ) {
    const base = emptyCategoryPrices(uomCodes);
    for (const cat of CUSTOMER_CATEGORIES) {
      for (const code of uomCodes) {
        const value = source?.[cat]?.[code];
        if (value !== undefined && value !== null) {
          base[cat][code] = String(value);
        }
      }
    }
    return base;
  }

  async function handleEdit(p: Product) {
    setError(null);
    setEditingId(p.id);
    setSku(p.sku);
    setName(p.name);
    setUnit(p.unit);
    setSupplierId(p.supplierId ?? "");
    setPurchasePrice(p.purchasePrice);
    setSalePrice(p.salePrice);
    setIsActive(p.isActive);
    setMinStockBase(p.minStockBase ?? "0");
    setReorderQtyBase(p.reorderQtyBase ?? "0");
    try {
      const res = await apiFetch<{
        data: Array<{
          uomCode: string;
          toBaseFactor: number;
          isSale: boolean;
          isPurchase: boolean;
          isDefaultSale: boolean;
          isDefaultPurchase: boolean;
        }>;
      }>(`/api/v1/products/${p.id}/uoms`);
      const mappings = (res.data ?? []).map((it) => ({
        uomCode: it.uomCode,
        toBaseFactor: String(it.toBaseFactor),
        isSale: it.isSale,
        isPurchase: it.isPurchase,
        isDefaultSale: it.isDefaultSale,
        isDefaultPurchase: it.isDefaultPurchase,
      }));
      const saleUoms = Array.from(new Set(mappings.filter((m) => m.isSale).map((m) => m.uomCode)));
      const fallbackUoms = saleUoms.length ? saleUoms : ["pcs", "pack", "dus"];
      setEditingMappings(mappings);
      setIsMappingInlineOpen(true);
      setUnitPrices(
        fallbackUoms.reduce(
          (acc, code) => ({ ...acc, [code]: String(p.unitPrices?.[code] ?? (code === "pcs" ? Number(p.salePrice) : 0)) }),
          {} as Record<string, string>,
        ),
      );
      setCategoryPrices(mergeCategoryPrices(p.categoryPrices, fallbackUoms));
    } catch {
      const fallbackUoms = ["pcs", "pack", "dus"];
      setEditingMappings([]);
      setIsMappingInlineOpen(false);
      setUnitPrices(
        fallbackUoms.reduce(
          (acc, code) => ({ ...acc, [code]: String(p.unitPrices?.[code] ?? (code === "pcs" ? Number(p.salePrice) : 0)) }),
          {} as Record<string, string>,
        ),
      );
      setCategoryPrices(mergeCategoryPrices(p.categoryPrices, fallbackUoms));
    }
    setIsFormOpen(true);
  }

  function handleOpenCreate() {
    resetProductForm();
    setIsFormOpen(true);
    focusSkuInput();
  }

  function resetProductForm() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("pcs");
    setSupplierId("");
    setPurchasePrice("0");
    setSalePrice("0");
    setIsActive(true);
    setMinStockBase("0");
    setReorderQtyBase("0");
    setUnitPrices({ pcs: "0" });
    setCategoryPrices(emptyCategoryPrices(["pcs"]));
    setEditingMappings([]);
    setIsMappingInlineOpen(false);
    setError(null);
  }

  function focusSkuInput() {
    window.requestAnimationFrame(() => {
      const skuInput = document.getElementById(skuInputId) as HTMLInputElement | null;
      skuInput?.focus();
      skuInput?.select();
    });
  }

  function handleCancelEdit() {
    resetProductForm();
    setIsFormOpen(false);
  }

  function handleDownloadTemplate() {
    exportToExcel(
      "template-import-produk.xlsx",
      ["Kode / Barcode", "Supplier", "Nama Barang", "Unit", "Harga beli", "Harga Jual", "Konversi", "Unit"],
      [["SKU001", "SUP001", "Nama Produk", "DUS", 12000, 15000, 12, "PCS"]],
    );
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ data: ProductImportSummary }>("/api/v1/products/import", {
        method: "POST",
        body: form,
      });
      setImportSummary(res.data);
      await load(page, pageSize, appliedQ);
      await loadUomMaster();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import produk gagal");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus produk ini?")) return;
    try {
      await apiFetch(`/api/v1/products/${id}`, { method: "DELETE" });
      const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
      await load(nextPage, pageSize, appliedQ);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus produk");
    }
  }

  async function load(
    nextPage = page,
    nextPageSize = pageSize,
    nextQ = appliedQ,
    nextStatusFilter = statusFilter,
  ) {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(nextPageSize),
        q: nextQ,
        isActive: nextStatusFilter,
      });
      const res = await apiFetch<ProductListResponse>(
        `/api/v1/products?${params.toString()}`,
      );
      const sortedItems = [...res.data].sort((a, b) => {
        const supplierA = (a.supplierName || "zzz tanpa supplier").toLowerCase();
        const supplierB = (b.supplierName || "zzz tanpa supplier").toLowerCase();
        if (supplierA !== supplierB) {
          return supplierA.localeCompare(supplierB, "id");
        }

        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        if (nameA !== nameB) {
          return nameA.localeCompare(nameB, "id");
        }

        return a.sku.toLowerCase().localeCompare(b.sku.toLowerCase(), "id");
      });
      setItems(sortedItems);
      setTotal(Number(res.meta?.total ?? 0));
      setPage(nextPage);
      setPageSize(nextPageSize);
      setAppliedQ(nextQ);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  async function loadUomMaster() {
    try {
      const rows = await fetchActiveUoms();
      setUomMaster(rows);
    } catch {
      setUomMaster([]);
    }
  }

  async function loadSuppliers() {
    try {
      const res = await apiFetch<{ data: SupplierOption[] }>("/api/v1/suppliers?page=1&pageSize=200&isActive=all");
      setSuppliers(res.data);
    } catch {
      setSuppliers([]);
    }
  }

  useEffect(() => {
    void load();
    void loadUomMaster();
    void loadSuppliers();
  }, []);

  useEffect(() => {
    const uomCodes = activePriceUoms.length ? activePriceUoms : [unit || "pcs"];
    setCategoryPrices((prev) => {
      const next = emptyCategoryPrices(uomCodes);
      for (const cat of CUSTOMER_CATEGORIES) {
        for (const code of uomCodes) {
          if (prev?.[cat]?.[code] !== undefined) {
            next[cat][code] = prev[cat][code];
          }
        }
      }
      return next;
    });
    setUnitPrices((prev) =>
      uomCodes.reduce(
        (acc, code) => ({ ...acc, [code]: prev[code] ?? (code === unit ? salePrice : "0") }),
        {} as Record<string, string>,
      ),
    );
  }, [activePriceUoms, salePrice, unit]);

  async function handleOpenUomMappings(product: Product) {
    setError(null);
    try {
      const res = await apiFetch<{
        data: Array<{
          uomCode: string;
          toBaseFactor: number;
          isSale: boolean;
          isPurchase: boolean;
          isDefaultSale: boolean;
          isDefaultPurchase: boolean;
        }>;
      }>(`/api/v1/products/${product.id}/uoms`);
      const next = (res.data ?? []).map((it) => ({
        uomCode: it.uomCode,
        toBaseFactor: String(it.toBaseFactor),
        isSale: it.isSale,
        isPurchase: it.isPurchase,
        isDefaultSale: it.isDefaultSale,
        isDefaultPurchase: it.isDefaultPurchase,
      }));
      setUomMappings(
        next.length
          ? next
          : [
              {
                uomCode: "pcs",
                toBaseFactor: "1",
                isSale: true,
                isPurchase: true,
                isDefaultSale: true,
                isDefaultPurchase: true,
              },
            ],
      );
      setMappingModalProduct(product);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat mapping UOM produk");
    }
  }

  async function handleSaveUomMappings() {
    if (!mappingModalProduct) return;
    setError(null);
    try {
      await apiFetch(`/api/v1/products/${mappingModalProduct.id}/uoms`, {
        method: "PUT",
        body: JSON.stringify({
          mappings: uomMappings.map((it) => ({
            uomCode: it.uomCode,
            toBaseFactor: Number(it.toBaseFactor),
            isSale: it.isSale,
            isPurchase: it.isPurchase,
            isDefaultSale: it.isDefaultSale,
            isDefaultPurchase: it.isDefaultPurchase,
          })),
        }),
      });
      setMappingModalProduct(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan mapping UOM produk");
    }
  }

  async function handleSaveProduct(mode: "close" | "create-another" = "close") {
    setError(null);
    setIsSavingProduct(true);
    try {
      const priceUoms = activePriceUoms.length ? activePriceUoms : [unit || "pcs"];
      const normalizedUnitPrices = priceUoms.reduce(
        (acc, code) => ({ ...acc, [code]: Number(unitPrices[code] ?? (code === unit ? salePrice : 0)) || 0 }),
        {} as Record<string, number>,
      );
      const normalizedCategoryPrices = CUSTOMER_CATEGORIES.reduce(
        (acc, cat) => ({
          ...acc,
          [cat]: priceUoms.reduce(
            (uAcc, code) => ({ ...uAcc, [code]: Number(categoryPrices?.[cat]?.[code] ?? 0) || 0 }),
            {} as Record<string, number>,
          ),
        }),
        {} as Record<string, Record<string, number>>,
      );
      const payload = {
        sku,
        name,
        unit,
        isActive,
        supplierId: supplierId || null,
        purchasePrice: Number(purchasePrice),
        salePrice: Number(salePrice),
        minStockBase: Number(minStockBase),
        reorderQtyBase: Number(reorderQtyBase),
        unitPrices: normalizedUnitPrices,
        categoryPrices: normalizedCategoryPrices,
      };
      if (editingId) {
        await apiFetch(`/api/v1/products/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/v1/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await load(page, pageSize, appliedQ, statusFilter);
      if (mode === "create-another" && !editingId) {
        resetProductForm();
        setIsFormOpen(true);
        focusSkuInput();
      } else {
        handleCancelEdit();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan produk");
    } finally {
      setIsSavingProduct(false);
    }
  }

  async function handleToggleActive(product: Product) {
    const nextActive = !product.isActive;
    const actionLabel = nextActive ? "mengaktifkan" : "menonaktifkan";
    if (!confirm(`Apakah Anda yakin ingin ${actionLabel} produk ini?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/v1/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextActive }),
      });
      await load(page, pageSize, appliedQ, statusFilter);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengubah status produk");
    }
  }

  const startItem = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = items.length === 0 ? 0 : startItem + items.length - 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 1 && !loading;
  const canGoNext = page < totalPages && !loading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Produk</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola SKU, satuan, harga beli, dan harga jual.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SKU / nama..." />
          </div>
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "true" | "false" | "all")}
          >
            <option value="true">Produk Aktif</option>
            <option value="false">Produk Nonaktif</option>
            <option value="all">Semua Status</option>
          </select>
          <Button
            variant="secondary"
            onClick={() => {
              void load(1, pageSize, q, statusFilter);
            }}
          >
            {loading ? "Memuat..." : "Cari"}
          </Button>
          <Button variant="secondary" onClick={handleDownloadTemplate}>
            Unduh Template XLSX
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
            }}
          />
          <Button
            variant="secondary"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Mengimpor..." : "Import Excel"}
          </Button>
          <Button onClick={handleOpenCreate}>Tambah Produk Baru</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-2 text-sm text-zinc-600">
          <div className="font-semibold text-zinc-900">Import Produk dari Excel</div>
          <p>
            File mendukung kolom <span className="font-medium">Kode / Barcode</span>,{" "}
            <span className="font-medium">Supplier</span>, <span className="font-medium">Nama Barang</span>,{" "}
            <span className="font-medium">Unit</span> besar, <span className="font-medium">Harga beli</span>,{" "}
            <span className="font-medium">Harga Jual</span>, <span className="font-medium">Konversi</span>, dan{" "}
            <span className="font-medium">Unit</span> kecil.
          </p>
          <p>
            Import berjalan dengan mode upsert berdasarkan SKU. Harga beli dan harga jual dibaca sebagai harga unit kecil/base unit.
          </p>
        </div>
        {importSummary ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <div>
              Total: <span className="font-semibold">{importSummary.total}</span> | Dibuat:{" "}
              <span className="font-semibold text-emerald-700">{importSummary.created}</span> | Diperbarui:{" "}
              <span className="font-semibold text-blue-700">{importSummary.updated}</span> | Gagal:{" "}
              <span className="font-semibold text-red-700">{importSummary.failed}</span>
            </div>
            {importSummary.errors?.length ? (
              <div className="mt-2 max-h-36 overflow-auto rounded border border-red-100 bg-white p-2 text-red-700">
                {importSummary.errors.slice(0, 20).map((err, idx) => (
                  <div key={idx}>
                    Baris {err.row}: {err.sku ? `${err.sku} - ` : ""}
                    {err.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div>
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Produk</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2 whitespace-nowrap">Sat. Dasar</th>
                  <th className="px-4 py-2">Harga Beli</th>
                  <th className="px-4 py-2 whitespace-nowrap">Min/Reorder Base</th>
                  <th className="px-4 py-2 whitespace-nowrap">Harga Retail (Dinamis)</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-zinc-100 hover:bg-zinc-50 ${p.isActive ? "" : "bg-zinc-50/70"}`}
                  >
                    <td className="px-4 py-2 font-medium">{p.sku}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2">{p.supplierName || "-"}</td>
                    <td className="px-4 py-2">{p.unit}</td>
                    <td className="whitespace-nowrap px-4 py-2">{formatCurrency(p.purchasePrice)}</td>
                    <td className="px-4 py-2">{`${Number(p.minStockBase ?? 0).toFixed(2)} / ${Number(p.reorderQtyBase ?? 0).toFixed(2)}`}</td>
                    <td className="px-4 py-2">
                      {p.categoryPrices?.["RETAIL"]
                        ? Object.entries(p.categoryPrices["RETAIL"])
                            .map(([code, price]) => `${code}: ${formatCurrency(price)}`)
                            .join(" | ")
                        : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => void handleToggleActive(p)}
                          className="font-medium text-amber-600 hover:text-amber-800"
                        >
                          {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button onClick={() => handleOpenUomMappings(p)} className="text-emerald-600 hover:text-emerald-800 font-medium">UOM</button>
                        <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={8}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
            <div className="text-zinc-600">
              Menampilkan {startItem}-{endItem} dari {total} produk
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-zinc-600">
                <span>Baris</span>
                <select
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={pageSize}
                  onChange={(e) => {
                    const nextPageSize = Number(e.target.value);
                    void load(1, nextPageSize, appliedQ, statusFilter);
                  }}
                  disabled={loading}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={!canGoPrev}
                  onClick={() => {
                    void load(page - 1, pageSize, appliedQ, statusFilter);
                  }}
                >
                  Prev
                </Button>
                <span className="min-w-[88px] text-center text-zinc-600">
                  Hal {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={!canGoNext}
                  onClick={() => {
                    void load(page + 1, pageSize, appliedQ, statusFilter);
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{editingId ? "Edit Produk" : "Tambah Produk Baru"}</div>
                <p className="text-xs text-zinc-500">Atur SKU, harga, konversi satuan, dan harga per kategori pelanggan.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={handleCancelEdit}
              >
                Tutup
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <Input
                id={skuInputId}
                label="SKU"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU-001"
                autoFocus
              />
              <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teh Botol 350ml" />
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Supplier</div>
                <SearchableSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Pilih supplier"
                  searchPlaceholder="Cari supplier..."
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: `${supplier.code} - ${supplier.name}${supplier.isActive === false ? " [Nonaktif]" : ""}`,
                  }))}
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Status Master</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={isActive ? "true" : "false"}
                  onChange={(e) => setIsActive(e.target.value === "true")}
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Satuan Dasar</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {(uomMaster.length ? uomMaster : [{ code: "pcs", name: "Pcs" }]).map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} - {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <NumericInput
                  label="Harga Beli (Dasar)"
                  mode="currency"
                  value={purchasePrice}
                  onValueChange={(v) => setPurchasePrice(v || "0")}
                />
                <NumericInput
                  label="Harga Jual (Dasar)"
                  mode="currency"
                  value={salePrice}
                  onValueChange={(v) => setSalePrice(v || "0")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumericInput
                  label="Min Stock (Qty Base)"
                  value={minStockBase}
                  onValueChange={(v) => setMinStockBase(v || "0")}
                />
                <NumericInput
                  label="Reorder Qty (Qty Base)"
                  value={reorderQtyBase}
                  onValueChange={(v) => setReorderQtyBase(v || "0")}
                />
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
                <div className="text-xs font-semibold text-zinc-600">Konversi Satuan (UOM V2)</div>
                <div className="text-xs text-zinc-600">
                  Konversi tidak lagi diinput fixed `pack/dus`. Kelola melalui tombol <strong>UOM</strong> pada daftar produk.
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
                <div className="text-xs font-semibold text-zinc-600">Harga Dasar per UOM Jual</div>
                <div className="grid grid-cols-2 gap-2">
                  {activePriceUoms.map((uomCode) => (
                    <NumericInput
                      key={uomCode}
                      label={`Harga ${uomCode}`}
                      mode="currency"
                      value={unitPrices[uomCode] ?? "0"}
                      onValueChange={(v) =>
                        setUnitPrices((prev) => ({ ...prev, [uomCode]: v || "0" }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 p-3 mt-2 space-y-3">
                <div className="text-xs font-semibold text-zinc-600">Harga Per Kategori Pelanggan (Dinamis)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="pb-2 font-medium">Kategori</th>
                        {activePriceUoms.map((uomCode) => (
                          <th key={uomCode} className="pb-2 font-medium">{`H. ${uomCode}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CUSTOMER_CATEGORIES.map((cat) => (
                        <tr key={cat} className="border-b border-zinc-100 last:border-0">
                          <td className="py-2 pr-2 text-xs font-medium text-zinc-700">{cat}</td>
                          {activePriceUoms.map((uomCode) => (
                            <td key={`${cat}-${uomCode}`} className="py-2 pr-2">
                              <NumericInput
                                value={categoryPrices[cat]?.[uomCode] ?? "0"}
                                mode="currency"
                                onValueChange={(v) =>
                                  setCategoryPrices((prev) => ({
                                    ...prev,
                                    [cat]: { ...(prev[cat] || {}), [uomCode]: v || "0" },
                                  }))
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancelEdit} disabled={isSavingProduct}>
                  Batal
                </Button>
                {!editingId ? (
                  <Button
                    variant="secondary"
                    disabled={!canCreate || isSavingProduct}
                    onClick={() => void handleSaveProduct("create-another")}
                  >
                    Simpan & Tambah Baru
                  </Button>
                ) : null}
                <Button disabled={!canCreate || isSavingProduct} onClick={() => void handleSaveProduct("close")}>
                  {isSavingProduct ? "Menyimpan..." : editingId ? "Update" : "Simpan"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {mappingModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Mapping UOM Produk</div>
                <p className="text-xs text-zinc-500">
                  {mappingModalProduct.sku} - {mappingModalProduct.name}
                </p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setMappingModalProduct(null)}
              >
                Tutup
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-zinc-200">
              <div className="grid grid-cols-12 gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                <div className="col-span-2">Satuan</div>
                <div className="col-span-2">Faktor ke Base</div>
                <div className="col-span-2">Sale</div>
                <div className="col-span-2">Purchase</div>
                <div className="col-span-2">Def. Sale</div>
                <div className="col-span-1">Def. Buy</div>
                <div className="col-span-1 text-right">Aksi</div>
              </div>
              <div className="space-y-2 p-3">
                {uomMappings.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      className="col-span-2 h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      value={row.uomCode}
                      onChange={(e) =>
                        setUomMappings((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, uomCode: e.target.value } : x)),
                        )
                      }
                    >
                      <option value="">Pilih satuan</option>
                      {uomMaster.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code} - {u.name}
                        </option>
                      ))}
                    </select>
                    <NumericInput
                      className="col-span-2"
                      value={row.toBaseFactor}
                      onValueChange={(v) =>
                        setUomMappings((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, toBaseFactor: v || "0" } : x)),
                        )
                      }
                    />
                    <label className="col-span-2 inline-flex h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.isSale}
                        onChange={(e) =>
                          setUomMappings((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, isSale: e.target.checked } : x)),
                          )
                        }
                      />
                      Ya
                    </label>
                    <label className="col-span-2 inline-flex h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.isPurchase}
                        onChange={(e) =>
                          setUomMappings((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, isPurchase: e.target.checked } : x)),
                          )
                        }
                      />
                      Ya
                    </label>
                    <label className="col-span-2 inline-flex h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="defaultSale"
                        checked={row.isDefaultSale}
                        onChange={() =>
                          setUomMappings((prev) =>
                            prev.map((x, i) => ({ ...x, isDefaultSale: i === idx })),
                          )
                        }
                      />
                      Default
                    </label>
                    <label className="col-span-1 inline-flex h-10 items-center justify-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="defaultPurchase"
                        checked={row.isDefaultPurchase}
                        onChange={() =>
                          setUomMappings((prev) =>
                            prev.map((x, i) => ({ ...x, isDefaultPurchase: i === idx })),
                          )
                        }
                      />
                    </label>
                    <div className="col-span-1 flex h-10 items-center justify-end">
                      <button
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                        onClick={() =>
                          setUomMappings((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
                        }
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() =>
                      setUomMappings((prev) => [
                        ...prev,
                        {
                          uomCode: "",
                          toBaseFactor: "1",
                          isSale: true,
                          isPurchase: true,
                          isDefaultSale: false,
                          isDefaultPurchase: false,
                        },
                      ])
                    }
                  >
                    Tambah Mapping
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setMappingModalProduct(null)}>
                Batal
              </Button>
              <Button onClick={handleSaveUomMappings}>Simpan Mapping</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
