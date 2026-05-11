import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";
import { fetchProductUomMappings, pickDefaultUom, toUomOptions, type ProductUomMapping } from "@/lib/uom";

type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string; purchasePrice: string };
type PoRow = { id: string; poNo: string; orderDate: string; status: string; totalAmount: string; supplierName: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseOrders() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<{ productId: string; qty: string; uom: string; unitPrice: string }[]>([
    { productId: "", qty: "1", uom: "pcs", unitPrice: "0" },
  ]);
  const [productUoms, setProductUoms] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [productUomMappings, setProductUomMappings] = useState<Record<string, ProductUomMapping[]>>({});
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [rows, setRows] = useState<PoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const canSubmit = useMemo(
    () => supplierId && items.every((i) => i.productId && Number(i.qty) > 0),
    [supplierId, items],
  );

  async function load() {
    const [s, p, po] = await Promise.all([
      apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: PoRow[] }>("/api/v1/purchase-orders?page=1&pageSize=50"),
    ]);
    setSuppliers(s.data);
    setProducts(p.data);
    setRows(po.data);
    if (!supplierId && s.data[0]?.id) setSupplierId(s.data[0].id);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function getToBaseFactor(productId: string, uom: string) {
    const mappings = productUomMappings[productId] ?? [];
    const match = mappings.find((m) => m.uomCode === uom);
    return Number(match?.toBaseFactor ?? 0);
  }

  function resolvePurchasePrice(p: Product | undefined, productId: string, uom: string) {
    if (!p) return "0";
    const basePrice = Number(p.purchasePrice) || 0;
    const factor = getToBaseFactor(productId, uom);
    if (factor > 0) return String(basePrice * factor);
    return String(basePrice);
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
    return productUoms[productId] ?? [
      { code: "pcs", name: "Pcs" },
      { code: "pack", name: "Pack" },
      { code: "dus", name: "Dus" },
    ];
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Purchase Order</h1>
        <p className="mt-1 text-sm text-zinc-600">Buat PO untuk supplier.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Daftar PO</span>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setIsFormOpen(true);
            }}
          >
            Tambah PO
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{r.poNo}</td>
                  <td className="px-4 py-2">{r.supplierName}</td>
                  <td className="px-4 py-2">{r.orderDate}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatCurrency(r.totalAmount)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={5}>
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
                <div className="text-base font-semibold">Buat Purchase Order</div>
                <p className="text-xs text-zinc-500">Pilih supplier, tanggal, lalu item pembelian.</p>
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
                <div className="mb-1 text-xs font-medium text-zinc-600">Supplier</div>
                <SearchableSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Pilih supplier"
                  searchPlaceholder="Cari supplier..."
                  options={suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
                />
              </label>

            <Input label="Tanggal" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

            <div className="rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">Item</div>
              <div className="grid gap-2 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid gap-2">
                    <SearchableSelect
                      value={it.productId}
                      onChange={async (pid) => {
                        const p = products.find((x) => x.id === pid);
                        let nextUom = "pcs";
                        if (pid) {
                          await ensureProductUomsLoaded(pid);
                          try {
                            const mappings = productUomMappings[pid] ?? (await fetchProductUomMappings(pid));
                            nextUom = pickDefaultUom(mappings, "purchase");
                          } catch {
                            nextUom = "pcs";
                          }
                        }
                        const nextPrice = resolvePurchasePrice(p, pid, nextUom);
                        setItems((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, productId: pid, uom: nextUom, unitPrice: nextPrice }
                              : x,
                          ),
                        );
                      }}
                      placeholder="Pilih produk"
                      searchPlaceholder="Cari SKU / nama produk..."
                      options={products.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                    />
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
                            const p = products.find((x) => x.id === it.productId);
                            const nextPrice = resolvePurchasePrice(p, it.productId, nextUom);
                            setItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, uom: nextUom, unitPrice: nextPrice } : x)),
                            );
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
                      label="Harga"
                      mode="currency"
                      value={it.unitPrice}
                      onValueChange={(v) =>
                        setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: v || "0" } : x)))
                      }
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
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", uom: "pcs", unitPrice: "0" }])}
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
                      await apiFetch("/api/v1/purchase-orders", {
                        method: "POST",
                        body: JSON.stringify({
                          supplierId,
                          orderDate,
                          items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), uom: i.uom, unitPrice: Number(i.unitPrice) })),
                        }),
                      });
                      setItems([{ productId: "", qty: "1", uom: "pcs", unitPrice: "0" }]);
                      const poRes = await apiFetch<{ data: PoRow[] }>("/api/v1/purchase-orders?page=1&pageSize=50");
                      setRows(poRes.data);
                      setIsFormOpen(false);
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Gagal membuat PO");
                    }
                  }}
                >
                  Simpan PO
                </Button>
              </div>
            </div>
        </Card>
        </div>
      ) : null}
    </div>
  );
}

