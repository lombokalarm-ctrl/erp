import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { fetchActiveUoms } from "@/lib/uom";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
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

const CUSTOMER_CATEGORIES = [
  "RETAIL",
  "GROSIR",
  "MODERN RETAIL",
  "HOREKA",
  "NASIONAL MODERN RETAIL",
];

export default function Products() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [uomMaster, setUomMaster] = useState<UomMaster[]>([]);
  const [mappingModalProduct, setMappingModalProduct] = useState<Product | null>(null);
  const [uomMappings, setUomMappings] = useState<ProductUomMapping[]>([]);
  const [editingMappings, setEditingMappings] = useState<ProductUomMapping[]>([]);
  const [isMappingInlineOpen, setIsMappingInlineOpen] = useState(false);

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
    setPurchasePrice(p.purchasePrice);
    setSalePrice(p.salePrice);
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
    handleCancelEdit();
    setCategoryPrices(emptyCategoryPrices([unit || "pcs"]));
    setIsFormOpen(true);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("pcs");
    setPurchasePrice("0");
    setSalePrice("0");
    setMinStockBase("0");
    setReorderQtyBase("0");
    setUnitPrices({ pcs: "0" });
    setCategoryPrices(emptyCategoryPrices(["pcs"]));
    setEditingMappings([]);
    setIsMappingInlineOpen(false);
    setError(null);
    setIsFormOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus produk ini?")) return;
    try {
      await apiFetch(`/api/v1/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus produk");
    }
  }

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: Product[] }>(
        "/api/v1/products?page=1&pageSize=50&q=" + encodeURIComponent(q),
      );
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
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

  useEffect(() => {
    load();
    loadUomMaster();
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

  async function handleSaveProduct() {
    setError(null);
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
      handleCancelEdit();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan produk");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Produk</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola SKU, satuan, harga beli, dan harga jual.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SKU / nama..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
          <Button onClick={handleOpenCreate}>Tambah Produk Baru</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div>
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Produk</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2 whitespace-nowrap">Sat. Dasar</th>
                  <th className="px-4 py-2">Harga Beli</th>
                  <th className="px-4 py-2 whitespace-nowrap">Min/Reorder Base</th>
                  <th className="px-4 py-2 whitespace-nowrap">Harga Retail (Dinamis)</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{p.sku}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2">{p.unit}</td>
                    <td className="px-4 py-2">{p.purchasePrice}</td>
                    <td className="px-4 py-2">{`${Number(p.minStockBase ?? 0).toFixed(2)} / ${Number(p.reorderQtyBase ?? 0).toFixed(2)}`}</td>
                    <td className="px-4 py-2">
                      {p.categoryPrices?.["RETAIL"]
                        ? Object.entries(p.categoryPrices["RETAIL"])
                            .map(([code, price]) => `${code}:${price}`)
                            .join(" | ")
                        : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleOpenUomMappings(p)} className="text-emerald-600 hover:text-emerald-800 font-medium">UOM</button>
                        <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={7}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
              <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
              <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teh Botol 350ml" />
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
                <Button variant="secondary" onClick={handleCancelEdit}>
                  Batal
                </Button>
                <Button disabled={!canCreate} onClick={handleSaveProduct}>
                  {editingId ? "Update" : "Simpan"}
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
