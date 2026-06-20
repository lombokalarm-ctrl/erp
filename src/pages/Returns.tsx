import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiFetch, ApiError } from "@/api/client";
import { RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/date";
import { fetchProductUomMappings, pickDefaultUom, toUomOptions } from "@/lib/uom";

type ReturnRow = {
  id: string;
  returnNo: string;
  type: string;
  status: string;
  financialStatus: string;
  creditNoteNo?: string;
  sourceInvoiceId?: string;
  sourceInvoiceNo?: string;
  referenceNo: string;
  returnDate: string;
  notes: string;
  customerName: string;
  supplierName: string;
};

type Customer = { id: string; name: string; code: string };
type Supplier = { id: string; name: string; code: string };
type Product = { id: string; name: string; sku: string };
type InvoiceRef = { id: string; invoiceNo: string; customerId: string; status: string };
type InvoiceDetail = {
  id: string;
  items: Array<{
    productId: string;
  }>;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Returns() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"SALES_RETURN" | "PURCHASE_RETURN">("SALES_RETURN");
  const [partnerId, setPartnerId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [sourceInvoiceId, setSourceInvoiceId] = useState("");
  const [returnDate, setReturnDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; qty: string; uom: string; reason: string }[]>([
    { productId: "", qty: "1", uom: "pcs", reason: "" },
  ]);
  const [productUoms, setProductUoms] = useState<Record<string, Array<{ code: string; name: string }>>>({});
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [invoiceAllowedProductIds, setInvoiceAllowedProductIds] = useState<string[]>([]);

  const canSubmit = useMemo(
    () =>
      partnerId &&
      (type === "PURCHASE_RETURN" || Boolean(sourceInvoiceId)) &&
      items.every((i) => i.productId && Number(i.qty) > 0),
    [partnerId, sourceInvoiceId, type, items],
  );

  async function loadInitial() {
    const [retRes, cRes, sRes, pRes, invRes] = await Promise.all([
      apiFetch<{ data: ReturnRow[] }>("/api/v1/returns?page=1&pageSize=50"),
      apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=200"),
      apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: InvoiceRef[] }>("/api/v1/invoices?page=1&pageSize=200"),
    ]);
    setRows(retRes.data);
    setCustomers(cRes.data);
    setSuppliers(sRes.data);
    setProducts(pRes.data);
    setInvoices(invRes.data);
  }

  useEffect(() => {
    loadInitial().catch(() => {});
  }, []);

  useEffect(() => {
    if (type !== "SALES_RETURN" || !sourceInvoiceId) {
      setInvoiceAllowedProductIds([]);
      return;
    }
    let isCancelled = false;
    apiFetch<{ data: InvoiceDetail }>(`/api/v1/invoices/${sourceInvoiceId}/detail`)
      .then((res) => {
        if (isCancelled) return;
        const ids = Array.from(new Set((res.data?.items ?? []).map((it) => it.productId).filter(Boolean)));
        setInvoiceAllowedProductIds(ids);
        setItems((prev) =>
          prev.map((row) =>
            !row.productId || ids.includes(row.productId) ? row : { ...row, productId: "" },
          ),
        );
      })
      .catch(() => {
        if (isCancelled) return;
        setInvoiceAllowedProductIds([]);
      });
    return () => {
      isCancelled = true;
    };
  }, [sourceInvoiceId, type]);

  async function ensureProductUomsLoaded(productId: string) {
    if (!productId || productUoms[productId]) return;
    try {
      const mappings = await fetchProductUomMappings(productId);
      const mode = type === "PURCHASE_RETURN" ? "purchase" : "sale";
      const options = toUomOptions(mappings, mode);
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

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/returns", {
        method: "POST",
        body: JSON.stringify({
          type,
          customerId: type === "SALES_RETURN" ? partnerId : undefined,
          supplierId: type === "PURCHASE_RETURN" ? partnerId : undefined,
          sourceInvoiceId: type === "SALES_RETURN" ? sourceInvoiceId : undefined,
          referenceNo,
          returnDate,
          notes,
          items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), uom: i.uom, reason: i.reason })),
        }),
      });

      setPartnerId("");
      setSourceInvoiceId("");
      setReferenceNo("");
      setNotes("");
      setItems([{ productId: "", qty: "1", uom: "pcs", reason: "" }]);
      setIsFormOpen(false);
      loadInitial();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memproses retur");
    } finally {
      setSaving(false);
    }
  }

  async function handlePost(returnId: string) {
    setError(null);
    try {
      await apiFetch(`/api/v1/returns/${returnId}/post`, { method: "POST" });
      await loadInitial();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memposting retur");
    }
  }

  const salesInvoices = useMemo(
    () => invoices.filter((inv) => inv.customerId === partnerId && inv.status !== "CANCELLED"),
    [invoices, partnerId],
  );

  const selectableProducts = useMemo(() => {
    if (type !== "SALES_RETURN" || !sourceInvoiceId) return products;
    if (!invoiceAllowedProductIds.length) return [];
    const allowed = new Set(invoiceAllowedProductIds);
    return products.filter((p) => allowed.has(p.id));
  }, [invoiceAllowedProductIds, products, sourceInvoiceId, type]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-indigo-600" />
          Retur Barang
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Catat pengembalian barang dari pelanggan (Sales Return) atau ke supplier (Purchase Return).
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Riwayat Retur</span>
          <Button
            size="sm"
            onClick={() => {
              setError(null);
              setIsFormOpen(true);
            }}
          >
            Buat Tiket Retur
          </Button>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No Retur</th>
                <th className="px-4 py-2">Tipe</th>
                <th className="px-4 py-2">Partner</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2">Note Kredit</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-indigo-600">{r.returnNo}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      r.type === 'SALES_RETURN' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {r.type === 'SALES_RETURN' ? 'IN (Cust)' : 'OUT (Supp)'}
                    </span>
                  </td>
                  <td className="px-4 py-2 truncate max-w-[120px]">{r.customerName || r.supplierName || '-'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        r.status === "POSTED" || r.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.status === "CANCELLED"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{formatDate(r.returnDate)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.referenceNo || '-'}</td>
                  <td className="px-4 py-2 text-xs text-zinc-600">{r.creditNoteNo || "-"}</td>
                  <td className="px-4 py-2 text-right">
                    {r.status === "DRAFT" ? (
                      <Button size="sm" variant="secondary" onClick={() => handlePost(r.id)}>
                        Post
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500" colSpan={8}>
                    Belum ada riwayat retur barang.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Buat Tiket Retur</div>
                <p className="text-xs text-zinc-500">Pilih tipe retur, partner, lalu detail barang.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsFormOpen(false)}
              >
                Tutup
              </button>
            </div>
            <div className="grid gap-3 mt-3">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Tipe Retur</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as any);
                    setPartnerId("");
                    setSourceInvoiceId("");
                    setInvoiceAllowedProductIds([]);
                    setProductUoms({});
                  }}
                >
                  <option value="SALES_RETURN">Dari Pelanggan (Sales Return)</option>
                  <option value="PURCHASE_RETURN">Ke Supplier (Purchase Return)</option>
                </select>
              </label>

            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                {type === "SALES_RETURN" ? "Pilih Pelanggan" : "Pilih Supplier"}
              </div>
              <SearchableSelect
                value={partnerId}
                onChange={setPartnerId}
                placeholder="-- Pilih --"
                searchPlaceholder={type === "SALES_RETURN" ? "Cari pelanggan..." : "Cari supplier..."}
                options={
                  type === "SALES_RETURN"
                    ? customers.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` }))
                    : suppliers.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))
                }
              />
            </label>

            {type === "SALES_RETURN" ? (
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Invoice Sumber</div>
                <SearchableSelect
                  value={sourceInvoiceId}
                  onChange={(nextInvoiceId) => {
                    setSourceInvoiceId(nextInvoiceId);
                    const selected = salesInvoices.find((x) => x.id === nextInvoiceId);
                    if (selected && !referenceNo) setReferenceNo(selected.invoiceNo);
                  }}
                  placeholder="-- Pilih Invoice --"
                  searchPlaceholder="Cari nomor invoice..."
                  options={salesInvoices.map((inv) => ({
                    value: inv.id,
                    label: `${inv.invoiceNo} (${inv.status})`,
                  }))}
                />
              </label>
            ) : null}

            {type === "SALES_RETURN" && sourceInvoiceId && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                Produk retur dibatasi hanya item yang ada di invoice sumber.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input label="Tanggal Retur" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              <Input label="No Ref (SO/PO/Inv)" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Opsional" />
            </div>

            <Input label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alasan retur..." />

            <div className="rounded-lg border border-zinc-200 mt-2">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                Barang Retur
              </div>
              <div className="grid gap-3 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid gap-2 border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                    <SearchableSelect
                      value={it.productId}
                      onChange={async (productId) => {
                        let nextUom = "pcs";
                        if (productId) {
                          await ensureProductUomsLoaded(productId);
                          try {
                            const mappings = await fetchProductUomMappings(productId);
                            nextUom = pickDefaultUom(mappings, type === "PURCHASE_RETURN" ? "purchase" : "sale");
                          } catch {
                            nextUom = "pcs";
                          }
                        }
                        setItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, productId, uom: nextUom } : x)),
                        );
                      }}
                      placeholder="Pilih produk..."
                      searchPlaceholder="Cari SKU / nama produk..."
                      options={selectableProducts.map((p) => ({ value: p.id, label: `${p.sku} - ${p.name}` }))}
                    />
                    <div className="flex gap-2">
                      <NumericInput
                        label="Qty"
                        className="w-20"
                        placeholder="Qty"
                        value={it.qty}
                        onValueChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, qty: v || "0" } : x))
                          )
                        }
                      />
                      <select
                        className="h-10 w-24 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                        value={it.uom}
                        onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, uom: e.target.value } : x))}
                      >
                        {getUomOptions(it.productId).map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.code}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="flex-1"
                        placeholder="Kondisi / Alasan..."
                        value={it.reason}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x))
                          )
                        }
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() =>
                          setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
                        }
                        disabled={items.length === 1}
                      >
                        Hapus Baris
                      </Button>
                      {idx === items.length - 1 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", uom: "pcs", reason: "" }])}
                        >
                          + Barang Lain
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setIsFormOpen(false)} disabled={saving}>
                  Batal
                </Button>
                <Button disabled={!canSubmit || saving} onClick={handleSubmit}>
                  {saving ? "Menyimpan..." : "Simpan Retur"}
                </Button>
              </div>
            </div>
        </Card>
        </div>
      ) : null}
    </div>
  );
}
