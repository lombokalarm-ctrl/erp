import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { formatDate } from "@/lib/date";
import { fetchProductUomMappings, toUomOptions, type ProductUomMapping } from "@/lib/uom";

type Warehouse = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; name: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  purchasePrice?: string;
  unitPrices?: Record<string, number>;
  supplierId?: string | null;
};
type GrnRow = { id: string; grnNo: string; receivedDate: string; warehouseCode: string };

type GoodsReceiptFormItem = {
  productId: string;
  qty: string;
  uom: string;
  masterPrice: string;
};

function pickLargestPurchaseUom(mappings: ProductUomMapping[]) {
  if (!mappings.length) return "pcs";
  const sorted = [...mappings].sort((left, right) => Number(right.toBaseFactor) - Number(left.toBaseFactor));
  return sorted[0]?.uomCode || "pcs";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function GoodsReceipts() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<GrnRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [items, setItems] = useState<GoodsReceiptFormItem[]>([
    { productId: "", qty: "1", uom: "pcs", masterPrice: "0" },
  ]);
  const [productUoms, setProductUoms] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [productUomMappings, setProductUomMappings] = useState<Record<string, ProductUomMapping[]>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTargetIdx, setScannerTargetIdx] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const canSubmit = useMemo(
    () => warehouseId && supplierId && items.every((i) => i.productId && Number(i.qty) > 0),
    [warehouseId, supplierId, items],
  );

  const filteredProducts = useMemo(() => {
    if (!supplierId) return [];
    return products.filter((product) => product.supplierId === supplierId);
  }, [products, supplierId]);

  async function load() {
    const [w, s, p, grn] = await Promise.all([
      apiFetch<{ data: Warehouse[] }>("/api/v1/warehouses"),
      apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: GrnRow[] }>("/api/v1/goods-receipts?page=1&pageSize=50"),
    ]);
    setWarehouses(w.data);
    setSuppliers(s.data);
    setProducts(p.data);
    setRows(grn.data);
    if (!warehouseId && w.data[0]?.id) setWarehouseId(w.data[0].id);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function getToBaseFactor(productId: string, uom: string) {
    const mappings = productUomMappings[productId] ?? [];
    const match = mappings.find((m) => m.uomCode === uom);
    return Number(match?.toBaseFactor ?? 0);
  }

  function resolveMasterPurchasePrice(p: Product | undefined, productId: string, uom: string) {
    const directUnitPrice = Number(p?.unitPrices?.[uom] ?? 0);
    if (directUnitPrice > 0) return String(directUnitPrice);
    const base = Number(p?.purchasePrice ?? 0) || 0;
    const factor = getToBaseFactor(productId, uom);
    if (factor > 0) return String(base * factor);
    return String(base);
  }

  async function ensureProductUomsLoaded(productId: string) {
    if (!productId || productUomMappings[productId]) return;
    try {
      const mappings = await fetchProductUomMappings(productId);
      const options = toUomOptions(mappings, "purchase");
      setProductUomMappings((prev) => ({ ...prev, [productId]: mappings }));
      if (options.length) {
        setProductUoms((prev) => ({ ...prev, [productId]: options }));
      }
    } catch {
      // ignore and fallback
    }
  }

  function getUomOptions(productId: string) {
    const options = productUoms[productId];
    const mappings = productUomMappings[productId] ?? [];
    if (options?.length) {
      return [...options].sort((left, right) => {
        const leftFactor = Number(mappings.find((item) => item.uomCode === left.code)?.toBaseFactor ?? 0);
        const rightFactor = Number(mappings.find((item) => item.uomCode === right.code)?.toBaseFactor ?? 0);
        return rightFactor - leftFactor;
      });
    }
    return [
      { code: "dus", name: "Dus" },
      { code: "pack", name: "Pack" },
      { code: "pcs", name: "Pcs" },
    ];
  }

  function handleScan(decodedText: string) {
    if (scannerTargetIdx === null) return;
    if (!supplierId) {
      alert("Pilih supplier terlebih dahulu sebelum scan produk.");
      return;
    }
    
    // Find product by SKU or Name within selected supplier
    const found = filteredProducts.find((p) => p.sku === decodedText || p.name.includes(decodedText));
    if (found) {
      void (async () => {
        let nextUom = "pcs";
        await ensureProductUomsLoaded(found.id);
        try {
          const mappings = productUomMappings[found.id] ?? (await fetchProductUomMappings(found.id));
          nextUom = pickLargestPurchaseUom(mappings);
        } catch {
          nextUom = "pcs";
        }
        const nextPrice = resolveMasterPurchasePrice(found, found.id, nextUom);
        setItems(prev => prev.map((x, i) => i === scannerTargetIdx ? { ...x, productId: found.id, uom: nextUom, masterPrice: nextPrice } : x));
        setShowScanner(false);
        setScannerTargetIdx(null);
      })();
    } else {
      alert(`Produk supplier terpilih dengan SKU ${decodedText} tidak ditemukan.`);
    }
  }

  function handleSupplierChange(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    setItems((prev) =>
      prev.map((item) => {
        if (!item.productId) return item;
        const product = products.find((candidate) => candidate.id === item.productId);
        if (product?.supplierId === nextSupplierId) return item;
        return { productId: "", qty: "1", uom: "pcs", masterPrice: "0" };
      }),
    );
  }

  return (
    <div className="space-y-4">
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => {
            setShowScanner(false);
            setScannerTargetIdx(null);
          }}
        />
      )}
      <div>
        <h1 className="text-lg font-semibold">Penerimaan Barang (GRN)</h1>
        <p className="mt-1 text-sm text-zinc-600">Mencatat barang masuk dan otomatis menambah stok.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Daftar GRN</span>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setIsFormOpen(true);
            }}
          >
            Tambah GRN
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Gudang</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{r.grnNo}</td>
                  <td className="px-4 py-2">{formatDate(r.receivedDate)}</td>
                  <td className="px-4 py-2">{r.warehouseCode}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={3}>
                    Belum ada data.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Buat Goods Receipt</div>
                <p className="text-xs text-zinc-500">Catat penerimaan barang masuk per gudang.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsFormOpen(false)}
              >
                Tutup
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Gudang</div>
                <SearchableSelect
                  value={warehouseId}
                  onChange={setWarehouseId}
                  placeholder="Pilih gudang"
                  searchPlaceholder="Cari gudang..."
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))}
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Supplier</div>
                <SearchableSelect
                  value={supplierId}
                  onChange={handleSupplierChange}
                  placeholder="Pilih supplier"
                  searchPlaceholder="Cari supplier..."
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: `${supplier.code} - ${supplier.name}`,
                  }))}
                />
              </label>

            <Input label="Tanggal Terima" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />

            <div className="rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">Item</div>
              <div className="grid gap-2 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid gap-2">
                    <div className="flex gap-2">
                      <SearchableSelect
                        className="flex-1"
                        value={it.productId}
                        onChange={async (productId) => {
                          let nextUom = "pcs";
                          if (productId) {
                            await ensureProductUomsLoaded(productId);
                            try {
                              const mappings = productUomMappings[productId] ?? (await fetchProductUomMappings(productId));
                              nextUom = pickLargestPurchaseUom(mappings);
                            } catch {
                              nextUom = "pcs";
                            }
                          }
                          const product = products.find((p) => p.id === productId);
                          const nextPrice = resolveMasterPurchasePrice(product, productId, nextUom);
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, productId, uom: nextUom, masterPrice: nextPrice } : x)),
                          );
                        }}
                        placeholder={supplierId ? "Pilih produk" : "Pilih supplier dulu"}
                        searchPlaceholder={supplierId ? "Cari SKU / nama produk..." : "Pilih supplier terlebih dahulu"}
                        options={filteredProducts.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                        disabled={!supplierId}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setScannerTargetIdx(idx);
                          setShowScanner(true);
                        }}
                        className="px-3"
                        title="Scan Barcode"
                        disabled={!supplierId}
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumericInput
                        label="Qty"
                        value={it.qty}
                        onValueChange={(v) =>
                          setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: v || "0" } : x)))
                        }
                      />
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-zinc-600">Satuan</div>
                        <select
                          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                          value={it.uom}
                          onChange={(e) => {
                            const nextUom = e.target.value;
                            const product = products.find((p) => p.id === it.productId);
                            const nextPrice = resolveMasterPurchasePrice(product, it.productId, nextUom);
                            setItems((prev) => prev.map((x, i) => i === idx ? { ...x, uom: nextUom, masterPrice: nextPrice } : x));
                          }}
                        >
                          {getUomOptions(it.productId).map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.code}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <NumericInput
                      label="Harga Master"
                      mode="currency"
                      value={it.masterPrice}
                      onValueChange={() => {}}
                      disabled
                    />
                    <div className="flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={items.length === 1}
                        onClick={() => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))}
                        type="button"
                      >
                        Hapus
                      </Button>
                      {idx === items.length - 1 ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", uom: "pcs", masterPrice: "0" }])}
                          disabled={!supplierId}
                        >
                          Tambah Item
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                  Batal
                </Button>
                <Button
                  disabled={!canSubmit}
                  onClick={async () => {
                    setError(null);
                    try {
                      await apiFetch("/api/v1/goods-receipts", {
                        method: "POST",
                        body: JSON.stringify({
                          warehouseId,
                          receivedDate,
                          items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), uom: i.uom })),
                        }),
                      });
                      setSupplierId("");
                      setItems([{ productId: "", qty: "1", uom: "pcs", masterPrice: "0" }]);
                      setIsFormOpen(false);
                      await load();
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Gagal membuat GRN");
                    }
                  }}
                >
                  Simpan GRN
                </Button>
              </div>
            </div>
        </Card>
        </div>
      ) : null}
    </div>
  );
}

