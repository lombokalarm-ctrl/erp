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
import { useSettingsStore } from "@/stores/settingsStore";

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

type ReturnDetail = {
  id: string;
  returnNo: string;
  type: "SALES_RETURN" | "PURCHASE_RETURN";
  status: string;
  financialStatus: string;
  creditNoteNo?: string | null;
  sourceInvoiceNo?: string | null;
  referenceNo?: string | null;
  returnDate: string;
  notes?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerRegionName?: string | null;
  supplierName?: string | null;
  supplierCode?: string | null;
  supplierAddress?: string | null;
  supplierPhone?: string | null;
  createdBy?: string | null;
  items: Array<{
    id: string;
    qty: number;
    uom: string;
    reason?: string | null;
    sku: string;
    productName: string;
  }>;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);

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
    fetchCompany();
  }, [fetchCompany]);

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

  async function handlePrint(returnId: string) {
    setError(null);
    try {
      const res = await apiFetch<{ data: ReturnDetail }>(`/api/v1/returns/${returnId}`);
      const detail = res.data;
      const companyName = escapeHtml(company?.name || "PT. ERP DISTRIBUTOR F&B");
      const companyAddress = escapeHtml(company?.address || "Alamat belum diatur").replace(/\r?\n/g, "<br/>");
      const companyPhone = escapeHtml(company?.phone || "-");
      const isSalesReturn = detail.type === "SALES_RETURN";
      const partnerName = isSalesReturn
        ? `${detail.customerCode || "-"} - ${detail.customerName || "-"}`
        : `${detail.supplierCode || "-"} - ${detail.supplierName || "-"}`;
      const partnerAddress = isSalesReturn ? detail.customerAddress : detail.supplierAddress;
      const partnerPhone = isSalesReturn ? detail.customerPhone : detail.supplierPhone;
      const partnerRegion = isSalesReturn ? detail.customerRegionName : null;
      const partnerLabel = isSalesReturn ? "Pelanggan" : "Supplier";
      const printWindow = window.open("", "_blank");

      if (!printWindow) {
        alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Retur - ${detail.returnNo}</title>
            <style>
              @page { size: A4; margin: 0.5in; }
              body { font-family: "Courier New", Courier, monospace; font-size: 13px; line-height: 1.4; color: #000; margin: 0; padding: 0; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
              .title { font-size: 18px; font-weight: bold; text-align: center; letter-spacing: 2px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 15px; }
              .meta-box { width: 48%; }
              .meta-box div { margin-bottom: 3px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
              th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: top; }
              th { font-weight: bold; border-bottom: 2px solid #000; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .footer { display: flex; justify-content: space-between; margin-top: 26px; text-align: center; }
              .signature { width: 30%; }
              .signature-line { margin-top: 50px; border-bottom: 1px solid #000; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <strong>${companyName}</strong><br/>
                ${companyAddress}<br/>
                Telp: ${companyPhone}
              </div>
              <div class="title">DOKUMEN RETUR</div>
            </div>

            <div class="meta">
              <div class="meta-box">
                <div><strong>No. Retur:</strong> ${detail.returnNo}</div>
                <div><strong>Tanggal:</strong> ${formatDate(detail.returnDate)}</div>
                <div><strong>Tipe:</strong> ${detail.type === "SALES_RETURN" ? "Sales Return" : "Purchase Return"}</div>
                <div><strong>Referensi:</strong> ${escapeHtml(detail.referenceNo || "-")}</div>
                <div><strong>Invoice Sumber:</strong> ${escapeHtml(detail.sourceInvoiceNo || "-")}</div>
              </div>
              <div class="meta-box">
                <div><strong>${partnerLabel}:</strong></div>
                <div>${escapeHtml(partnerName)}</div>
                ${isSalesReturn ? `<div><strong>Wilayah:</strong> ${escapeHtml(partnerRegion || "-")}</div>` : ""}
                <div><strong>Alamat:</strong> ${escapeHtml(partnerAddress || "-").replace(/\r?\n/g, "<br/>")}</div>
                <div><strong>Telp:</strong> ${escapeHtml(partnerPhone || "-")}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 5%" class="text-center">No</th>
                  <th style="width: 16%">SKU</th>
                  <th style="width: 35%">Nama Barang</th>
                  <th style="width: 12%" class="text-right">Qty</th>
                  <th style="width: 12%">Satuan</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                ${detail.items
                  .map(
                    (it, i) => `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>${escapeHtml(it.sku)}</td>
                    <td>${escapeHtml(it.productName)}</td>
                    <td class="text-right">${it.qty}</td>
                    <td>${escapeHtml(it.uom)}</td>
                    <td>${escapeHtml(it.reason || "-")}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>

            <div><strong>Catatan:</strong> ${escapeHtml(detail.notes || "-")}</div>

            <div class="footer">
              <div class="signature">
                <div>${partnerLabel}</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Dibuat Oleh</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Gudang</div>
                <div class="signature-line"></div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data cetak retur");
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
                    <div className="flex justify-end gap-2">
                      {r.status === "DRAFT" ? (
                        <Button size="sm" variant="secondary" onClick={() => handlePost(r.id)}>
                          Post
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={() => handlePrint(r.id)}>
                        Cetak
                      </Button>
                    </div>
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
