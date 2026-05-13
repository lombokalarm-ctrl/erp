import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";
import { fetchProductUomMappings, pickDefaultUom, toUomOptions, type ProductUomMapping } from "@/lib/uom";

type Warehouse = { id: string; code: string; name: string };
type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string; purchasePrice?: string };

type PurchaseInvoiceRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  warehouseCode: string;
  supplierName: string;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  itemCount: number;
};

type DiscType = "PERCENT" | "AMOUNT";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return d.toISOString().slice(0, 10);
}

function calcLine(qty: number, basePrice: number, disc1Type: DiscType, disc1Value: number, disc2Type: DiscType, disc2Value: number) {
  const grossUnit = basePrice;
  const disc1Unit = disc1Type === "PERCENT" ? (grossUnit * disc1Value) / 100 : disc1Value;
  const after1Unit = Math.max(0, grossUnit - disc1Unit);
  const disc2Unit = disc2Type === "PERCENT" ? (after1Unit * disc2Value) / 100 : disc2Value;
  const netUnit = Math.max(0, after1Unit - disc2Unit);
  const lineGross = grossUnit * qty;
  const lineDisc1 = disc1Unit * qty;
  const lineDisc2 = disc2Unit * qty;
  const lineDiscount = (disc1Unit + disc2Unit) * qty;
  const lineNet = netUnit * qty;
  return { netUnit, lineGross, lineDisc1, lineDisc2, lineDiscount, lineNet };
}

function toNumberSafe(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIntegerString(value: unknown) {
  return String(Math.round(toNumberSafe(value)));
}

function toDecimalString(value: unknown) {
  const n = toNumberSafe(value);
  return String(n);
}

export default function PurchaseInvoices() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<PurchaseInvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editInvoiceNo, setEditInvoiceNo] = useState<string | null>(null);

  const [invoiceDate, setInvoiceDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [termDays, setTermDays] = useState("0");
  const [dueDate, setDueDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    Array<{
      productId: string;
      uomCode: string;
      qty: string;
      basePrice: string;
      disc1Type: DiscType;
      disc1Value: string;
      disc2Type: DiscType;
      disc2Value: string;
    }>
  >([{ productId: "", uomCode: "pcs", qty: "1", basePrice: "0", disc1Type: "PERCENT", disc1Value: "0", disc2Type: "PERCENT", disc2Value: "0" }]);

  const [productUoms, setProductUoms] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [productUomMappings, setProductUomMappings] = useState<Record<string, ProductUomMapping[]>>({});

  const canSubmit = useMemo(
    () =>
      warehouseId &&
      supplierId &&
      items.every((i) => i.productId && i.uomCode && Number(i.qty) > 0),
    [warehouseId, supplierId, items],
  );

  async function load() {
    const [w, s, p, inv] = await Promise.all([
      apiFetch<{ data: Warehouse[] }>("/api/v1/warehouses"),
      apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: PurchaseInvoiceRow[] }>("/api/v1/purchase-invoices?page=1&pageSize=50"),
    ]);
    setWarehouses(w.data);
    setSuppliers(s.data);
    setProducts(p.data);
    setRows(inv.data);
    if (!warehouseId && w.data[0]?.id) setWarehouseId(w.data[0].id);
    if (!supplierId && s.data[0]?.id) setSupplierId(s.data[0].id);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    const days = Math.trunc(Number(termDays || "0"));
    if (!Number.isFinite(days) || days < 0) return;
    setDueDate(addDays(invoiceDate, days));
  }, [invoiceDate, termDays]);

  function getToBaseFactor(productId: string, uom: string) {
    const mappings = productUomMappings[productId] ?? [];
    const match = mappings.find((m) => m.uomCode === uom);
    return Number(match?.toBaseFactor ?? 0);
  }

  function resolveBasePrice(p: Product | undefined, productId: string, uom: string) {
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
    return productUoms[productId] ?? [
      { code: "pcs", name: "Pcs" },
      { code: "pack", name: "Pack" },
      { code: "dus", name: "Dus" },
    ];
  }

  const totals = useMemo(() => {
    let gross = 0;
    let disc = 0;
    let net = 0;
    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const basePrice = Number(it.basePrice) || 0;
      const disc1Value = Number(it.disc1Value) || 0;
      const disc2Value = Number(it.disc2Value) || 0;
      if (qty <= 0 || !it.productId) continue;
      const r = calcLine(qty, basePrice, it.disc1Type, disc1Value, it.disc2Type, disc2Value);
      gross += r.lineGross;
      disc += r.lineDiscount;
      net += r.lineNet;
    }
    return { gross, disc, net };
  }, [items]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Faktur Pembelian (Pabrik)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Input faktur pembelian per item (harga dasar + diskon 1 & 2), mendukung multi-satuan per produk.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Daftar Faktur Pembelian</span>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setEditId(null);
              setEditInvoiceNo(null);
              setInvoiceDate(today());
              setTermDays("0");
              setNotes("");
              setItems([{ productId: "", uomCode: "pcs", qty: "1", basePrice: "0", disc1Type: "PERCENT", disc1Value: "0", disc2Type: "PERCENT", disc2Value: "0" }]);
              setIsFormOpen(true);
            }}
          >
            Tambah Faktur
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Gudang</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Jatuh Tempo</th>
                <th className="px-4 py-2">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-2 text-right">Bersih</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{r.invoiceNo}</td>
                  <td className="px-4 py-2">{r.supplierName}</td>
                  <td className="px-4 py-2">{r.warehouseCode}</td>
                  <td className="px-4 py-2">{r.invoiceDate}</td>
                  <td className="px-4 py-2">{r.dueDate}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatCurrency(r.netAmount)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            setError(null);
                            const res = await apiFetch<{ data: any }>(`/api/v1/purchase-invoices/${r.id}`);
                            setDetail(res.data);
                            setIsDetailOpen(true);
                          } catch (e) {
                            setError(e instanceof ApiError ? e.message : "Gagal memuat detail faktur");
                          }
                        }}
                      >
                        Detail
                      </Button>
                      {r.status === "DRAFT" ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              try {
                                setError(null);
                                const res = await apiFetch<{ data: any }>(`/api/v1/purchase-invoices/${r.id}`);
                                const d = res.data;
                                setEditId(r.id);
                                setEditInvoiceNo(d?.header?.invoiceNo ?? null);
                                setInvoiceDate(d?.header?.invoiceDate ?? today());
                                setWarehouseId(d?.header?.warehouseId ?? "");
                                setSupplierId(d?.header?.supplierId ?? "");
                                setTermDays(String(d?.header?.termDays ?? 0));
                                setDueDate(d?.header?.dueDate ?? today());
                                setNotes(d?.header?.notes ?? "");
                                setItems(
                                  (d?.items ?? []).map((it: any) => ({
                                    productId: it.productId,
                                    uomCode: it.uomCode,
                                    qty: toIntegerString(it.qty),
                                    basePrice: toIntegerString(it.basePrice),
                                    disc1Type: (it.disc1Type ?? "PERCENT") as DiscType,
                                    disc1Value:
                                      (it.disc1Type ?? "PERCENT") === "AMOUNT"
                                        ? toIntegerString(it.disc1Value)
                                        : toDecimalString(it.disc1Value),
                                    disc2Type: (it.disc2Type ?? "PERCENT") as DiscType,
                                    disc2Value:
                                      (it.disc2Type ?? "PERCENT") === "AMOUNT"
                                        ? toIntegerString(it.disc2Value)
                                        : toDecimalString(it.disc2Value),
                                  })),
                                );
                                setIsFormOpen(true);
                                const productIds = (d?.items ?? []).map((x: any) => x.productId).filter(Boolean);
                                for (const pid of productIds) {
                                  await ensureProductUomsLoaded(pid);
                                }
                              } catch (e) {
                                setError(e instanceof ApiError ? e.message : "Gagal memuat faktur untuk edit");
                              }
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              const okDel = window.confirm(`Hapus faktur ${r.invoiceNo}?`);
                              if (!okDel) return;
                              try {
                                setError(null);
                                await apiFetch(`/api/v1/purchase-invoices/${r.id}`, { method: "DELETE" });
                                const inv = await apiFetch<{ data: PurchaseInvoiceRow[] }>("/api/v1/purchase-invoices?page=1&pageSize=50");
                                setRows(inv.data);
                              } catch (e) {
                                setError(e instanceof ApiError ? e.message : "Gagal menghapus faktur");
                              }
                            }}
                          >
                            Hapus
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                setError(null);
                                await apiFetch(`/api/v1/purchase-invoices/${r.id}/post`, { method: "POST" });
                                const inv = await apiFetch<{ data: PurchaseInvoiceRow[] }>("/api/v1/purchase-invoices?page=1&pageSize=50");
                                setRows(inv.data);
                              } catch (e) {
                                setError(e instanceof ApiError ? e.message : "Gagal posting faktur");
                              }
                            }}
                          >
                            Posting
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={8}>
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
          <Card className="w-full max-w-4xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">
                  {editId ? "Edit Faktur Pembelian" : "Buat Faktur Pembelian"}
                </div>
                <p className="text-xs text-zinc-500">
                  {editId ? (editInvoiceNo ? `No: ${editInvoiceNo}` : "Faktur DRAFT") : "Nomor faktur otomatis saat disimpan."}
                </p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsFormOpen(false)}
              >
                Tutup
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                    onChange={setSupplierId}
                    placeholder="Pilih supplier"
                    searchPlaceholder="Cari supplier..."
                    options={suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input label="Tanggal Faktur" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                <NumericInput label="Jatuh Tempo (hari)" value={termDays} onValueChange={(v) => setTermDays(v || "0")} />
                <Input label="Tanggal Jatuh Tempo" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <Input label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div className="rounded-lg border border-zinc-200">
                <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">Item</div>
                <div className="grid gap-3 p-3">
                  {items.map((it, idx) => {
                    const qty = Number(it.qty) || 0;
                    const basePrice = Number(it.basePrice) || 0;
                    const disc1Value = Number(it.disc1Value) || 0;
                    const disc2Value = Number(it.disc2Value) || 0;
                    const r = qty > 0 ? calcLine(qty, basePrice, it.disc1Type, disc1Value, it.disc2Type, disc2Value) : null;
                    return (
                      <div key={idx} className="rounded-lg border border-zinc-200 p-3">
                        <div className="grid gap-2">
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
                              const nextPrice = resolveBasePrice(p, pid, nextUom);
                              setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, productId: pid, uomCode: nextUom, basePrice: nextPrice } : x)));
                            }}
                            placeholder="Pilih produk"
                            searchPlaceholder="Cari SKU / nama produk..."
                            options={products.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                          />

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <NumericInput label="Qty" value={it.qty} onValueChange={(v) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: v || "0" } : x)))} />
                            <label className="block">
                              <div className="mb-1 text-xs font-medium text-zinc-600">Satuan</div>
                              <select
                                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                value={it.uomCode}
                                onChange={(e) => {
                                  const nextUom = e.target.value;
                                  const p = products.find((x) => x.id === it.productId);
                                  const nextPrice = resolveBasePrice(p, it.productId, nextUom);
                                  setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, uomCode: nextUom, basePrice: nextPrice } : x)));
                                }}
                              >
                                {getUomOptions(it.productId).map((u) => (
                                  <option key={u.code} value={u.code}>
                                    {u.code}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <NumericInput label="Harga Dasar / Unit" mode="currency" value={it.basePrice} onValueChange={(v) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, basePrice: v || "0" } : x)))} />
                          </div>

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-zinc-600">Diskon 1</div>
                                <select
                                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                  value={it.disc1Type}
                                  onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, disc1Type: e.target.value as DiscType } : x)))}
                                >
                                  <option value="PERCENT">%</option>
                                  <option value="AMOUNT">Rp</option>
                                </select>
                              </label>
                              <div className="col-span-2">
                                <NumericInput
                                  label="Nilai"
                                  mode={it.disc1Type === "AMOUNT" ? "currency" : "decimal"}
                                  value={it.disc1Value}
                                  onValueChange={(v) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, disc1Value: v || "0" } : x)))}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-zinc-600">Diskon 2</div>
                                <select
                                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                  value={it.disc2Type}
                                  onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, disc2Type: e.target.value as DiscType } : x)))}
                                >
                                  <option value="PERCENT">%</option>
                                  <option value="AMOUNT">Rp</option>
                                </select>
                              </label>
                              <div className="col-span-2">
                                <NumericInput
                                  label="Nilai"
                                  mode={it.disc2Type === "AMOUNT" ? "currency" : "decimal"}
                                  value={it.disc2Value}
                                  onValueChange={(v) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, disc2Value: v || "0" } : x)))}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                              <div className="text-xs text-zinc-500">Harga Bersih / Unit</div>
                              <div className="mt-1 font-semibold">{formatCurrency(r?.netUnit ?? 0)}</div>
                            </div>
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                              <div className="text-xs text-zinc-500">Total Diskon</div>
                              <div className="mt-1 font-semibold text-red-700">- {formatCurrency(r?.lineDiscount ?? 0)}</div>
                            </div>
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                              <div className="text-xs text-zinc-500">Total Bersih</div>
                              <div className="mt-1 font-semibold text-emerald-700">{formatCurrency(r?.lineNet ?? 0)}</div>
                            </div>
                          </div>

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
                                onClick={() =>
                                  setItems((prev) => [
                                    ...prev,
                                    { productId: "", uomCode: "pcs", qty: "1", basePrice: "0", disc1Type: "PERCENT", disc1Value: "0", disc2Type: "PERCENT", disc2Value: "0" },
                                  ])
                                }
                              >
                                Tambah Item
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs text-zinc-500">Total Bruto</div>
                  <div className="mt-1 font-semibold">{formatCurrency(totals.gross)}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs text-zinc-500">Total Diskon</div>
                  <div className="mt-1 font-semibold text-red-700">- {formatCurrency(totals.disc)}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs text-zinc-500">Total Bersih</div>
                  <div className="mt-1 font-semibold text-emerald-700">{formatCurrency(totals.net)}</div>
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
                      const url = editId ? `/api/v1/purchase-invoices/${editId}` : "/api/v1/purchase-invoices";
                      const method = editId ? "PATCH" : "POST";
                      await apiFetch(url, {
                        method,
                        body: JSON.stringify({
                          invoiceDate,
                          warehouseId,
                          supplierId,
                          termDays: Number(termDays),
                          dueDate,
                          notes: notes || undefined,
                          items: items.map((i) => ({
                            productId: i.productId,
                            uomCode: i.uomCode,
                            qty: Number(i.qty),
                            basePrice: Number(i.basePrice),
                            disc1Type: i.disc1Type,
                            disc1Value: Number(i.disc1Value),
                            disc2Type: i.disc2Type,
                            disc2Value: Number(i.disc2Value),
                          })),
                        }),
                      });
                      const inv = await apiFetch<{ data: PurchaseInvoiceRow[] }>("/api/v1/purchase-invoices?page=1&pageSize=50");
                      setRows(inv.data);
                      setEditId(null);
                      setEditInvoiceNo(null);
                      setIsFormOpen(false);
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : editId ? "Gagal mengupdate faktur pembelian" : "Gagal membuat faktur pembelian");
                    }
                  }}
                >
                  Simpan Faktur
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {isDetailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Detail Faktur</div>
                <p className="text-xs text-zinc-500">{detail?.header?.invoiceNo ?? "-"}</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsDetailOpen(false)}
              >
                Tutup
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs text-zinc-500">Supplier</div>
                  <div className="mt-1 font-semibold">{detail?.header?.supplierName ?? "-"}</div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs text-zinc-500">Gudang</div>
                  <div className="mt-1 font-semibold">{detail?.header?.warehouseCode ?? "-"}</div>
                </div>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Item</div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                        <th className="px-4 py-2">Produk</th>
                        <th className="px-4 py-2">Satuan</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Harga</th>
                        <th className="px-4 py-2 text-right">Diskon 1</th>
                        <th className="px-4 py-2 text-right">Diskon 2</th>
                        <th className="px-4 py-2 text-right">Diskon Total</th>
                        <th className="px-4 py-2 text-right">Bersih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.items ?? []).map((it: any) => (
                        (() => {
                          const qty = Number(it.qty) || 0;
                          const basePrice = Number(it.basePrice) || 0;
                          const disc1Type = (it.disc1Type ?? "PERCENT") as DiscType;
                          const disc2Type = (it.disc2Type ?? "PERCENT") as DiscType;
                          const disc1Value = Number(it.disc1Value) || 0;
                          const disc2Value = Number(it.disc2Value) || 0;
                          const r = qty > 0 ? calcLine(qty, basePrice, disc1Type, disc1Value, disc2Type, disc2Value) : null;
                          return (
                        <tr key={it.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="px-4 py-2">
                            <div className="font-medium">{it.productName}</div>
                            <div className="text-xs text-zinc-500">{it.sku}</div>
                          </td>
                          <td className="px-4 py-2">{it.uomCode}</td>
                          <td className="px-4 py-2 text-right">{Number(it.qty).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(it.basePrice)}</td>
                          <td className="px-4 py-2 text-right text-red-600">- {formatCurrency(r?.lineDisc1 ?? 0)}</td>
                          <td className="px-4 py-2 text-right text-red-600">- {formatCurrency(r?.lineDisc2 ?? 0)}</td>
                          <td className="px-4 py-2 text-right text-red-600">- {formatCurrency(it.lineDiscount)}</td>
                          <td className="px-4 py-2 text-right font-medium text-emerald-600">{formatCurrency(it.lineNet)}</td>
                        </tr>
                          );
                        })()
                      ))}
                      {(detail?.items ?? []).length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={8}>
                            Belum ada item.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
