import { useEffect, useMemo, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { useSettingsStore } from "@/stores/settingsStore";

type Customer = { id: string; name: string; code: string; category: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  categoryPrices?: Record<string, { pcs: number; pack: number; dus: number }>;
  unitPrices?: { pcs: number; pack: number; dus: number };
  packSize?: number;
  dusSize?: number;
};

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  customerId: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

type SalesOrderDetail = {
  id: string;
  orderNo: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  notes?: string | null;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    qty: string;
    uom: "pcs" | "pack" | "dus";
    unitPrice: string;
    discountAmount: string;
    lineTotal: string;
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

export default function SalesOrders() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<SalesOrderDetail | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    { productId: string; qty: string; uom: "pcs" | "pack" | "dus"; unitPrice: string }[]
  >([{ productId: "", qty: "1", uom: "pcs", unitPrice: "0" }]);
  const company = useSettingsStore((s) => s.company);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);

  function resolveUnitPrice(p: Product | undefined, c: Customer | undefined, uom: "pcs" | "pack" | "dus") {
    if (!p) return "0";
    if (c && p.categoryPrices && p.categoryPrices[c.category] && p.categoryPrices[c.category][uom] !== undefined) {
      const catPrice = p.categoryPrices[c.category][uom];
      if (catPrice > 0) return String(catPrice);
    }
    const up = p.unitPrices?.[uom];
    if (up !== undefined && up > 0) return String(up);
    return String(p.salePrice);
  }

  const canSubmit = useMemo(
    () => customerId && items.every((i) => i.productId && Number(i.qty) > 0),
    [customerId, items],
  );

  async function loadInitial() {
    try {
      const [cRes, pRes, soRes] = await Promise.all([
        apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=100"),
        apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
        apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=50"),
      ]);
      setCustomers(cRes.data);
      setProducts(pRes.data);
      setOrders(soRes.data);

      // Save to local storage for offline use
      localStorage.setItem("offline_customers", JSON.stringify(cRes.data));
      localStorage.setItem("offline_products", JSON.stringify(pRes.data));
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to load initial data from network, falling back to local storage", err);
      setIsOffline(true);
      const cStr = localStorage.getItem("offline_customers");
      const pStr = localStorage.getItem("offline_products");
      if (cStr) setCustomers(JSON.parse(cStr));
      if (pStr) setProducts(JSON.parse(pStr));
    }
  }

  useEffect(() => {
    loadInitial();
    fetchCompany();
    
    // Load offline orders from local storage
    const offline = localStorage.getItem("offline_sales_orders");
    if (offline) {
      setOfflineOrders(JSON.parse(offline));
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchCompany]);

  function resetForm() {
    setCustomerId("");
    setOrderDate(today());
    setNotes("");
    setItems([{ productId: "", qty: "1", uom: "pcs", unitPrice: "0" }]);
    setEditingOrderId(null);
  }

  async function getOrderDetail(soId: string) {
    const res = await apiFetch<{ data: SalesOrderDetail }>(`/api/v1/sales-orders/${soId}`);
    return res.data;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const payload = {
      customerId,
      orderDate,
      notes: notes.trim() || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        qty: Number(i.qty),
        uom: i.uom,
        unitPrice: Number(i.unitPrice),
      })),
    };

    if (isOffline && editingOrderId) {
      setError("Edit Sales Order tidak tersedia saat offline.");
      return;
    }

    if (isOffline) {
      const newOfflineOrders = [...offlineOrders, { ...payload, _id: Date.now().toString() }];
      setOfflineOrders(newOfflineOrders);
      localStorage.setItem("offline_sales_orders", JSON.stringify(newOfflineOrders));

      resetForm();
      setIsFormOpen(false);
      alert("Order disimpan secara offline. Sinkronisasi saat terhubung ke internet.");
      return;
    }

    try {
      await apiFetch(editingOrderId ? `/api/v1/sales-orders/${editingOrderId}` : "/api/v1/sales-orders", {
        method: editingOrderId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      resetForm();
      setIsFormOpen(false);
      loadInitial();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan order");
    }
  }

  async function handleSync() {
    if (offlineOrders.length === 0) return;
    setSyncing(true);
    setError(null);
    try {
      for (const order of offlineOrders) {
        await apiFetch("/api/v1/sales-orders", {
          method: "POST",
          body: JSON.stringify({
            customerId: order.customerId,
            orderDate: order.orderDate,
            items: order.items,
          }),
        });
      }
      setOfflineOrders([]);
      localStorage.removeItem("offline_sales_orders");
      alert("Sinkronisasi berhasil!");
      loadInitial();
    } catch (err: any) {
      setError("Gagal melakukan sinkronisasi: " + (err.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  }

  async function handleView(soId: string) {
    try {
      setError(null);
      const detail = await getOrderDetail(soId);
      setViewOrder(detail);
      setIsViewOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat detail Sales Order");
    }
  }

  async function handleEdit(soId: string) {
    try {
      setError(null);
      const detail = await getOrderDetail(soId);
      setEditingOrderId(detail.id);
      setCustomerId(detail.customerId);
      setOrderDate(detail.orderDate);
      setNotes(detail.notes || "");
      setItems(
        detail.items.map((it) => ({
          productId: it.productId,
          qty: String(Number(it.qty)),
          uom: it.uom,
          unitPrice: String(Number(it.unitPrice)),
        })),
      );
      setIsFormOpen(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data edit");
    }
  }

  async function handleDelete(so: SalesOrderRow) {
    if (!confirm(`Hapus Sales Order ${so.orderNo}?`)) return;
    try {
      setError(null);
      await apiFetch(`/api/v1/sales-orders/${so.id}`, { method: "DELETE" });
      await loadInitial();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus Sales Order");
    }
  }

  async function handlePrint(soId: string) {
    try {
      const detail = await getOrderDetail(soId);
      const companyName = escapeHtml(company?.name || "PT. ERP DISTRIBUTOR F&B");
      const companyAddress = escapeHtml(company?.address || "Alamat belum diatur").replace(/\r?\n/g, "<br/>");
      const companyPhone = escapeHtml(company?.phone || "-");

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Sales Order - ${detail.orderNo}</title>
            <style>
              @page { size: A4; margin: 0.5in; }
              body { font-family: "Courier New", Courier, monospace; font-size: 13px; color: #000; margin: 0; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 16px; }
              .title { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 14px; }
              .meta-box { width: 48%; }
              .meta-box div { margin-bottom: 4px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
              th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
              th { font-weight: bold; }
              .text-right { text-align: right; }
              .summary { width: 45%; margin-left: auto; }
              .summary td { border: none; padding: 3px 0; }
              .total { border-top: 1px solid #000; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <strong>${companyName}</strong><br/>
                ${companyAddress}<br/>
                Telp: ${companyPhone}
              </div>
              <div class="title">SALES ORDER</div>
            </div>
            <div class="meta">
              <div class="meta-box">
                <div><strong>No. SO :</strong> ${detail.orderNo}</div>
                <div><strong>Tanggal:</strong> ${detail.orderDate}</div>
                <div><strong>Status :</strong> ${detail.status}</div>
              </div>
              <div class="meta-box">
                <div><strong>Pelanggan:</strong></div>
                <div>${detail.customerCode} - ${detail.customerName}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:5%">No</th>
                  <th style="width:18%">SKU</th>
                  <th>Nama Barang</th>
                  <th style="width:10%" class="text-right">Qty</th>
                  <th style="width:10%">Satuan</th>
                  <th style="width:17%" class="text-right">Harga</th>
                  <th style="width:18%" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${detail.items
                  .map(
                    (it, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${it.sku}</td>
                    <td>${it.productName}</td>
                    <td class="text-right">${it.qty}</td>
                    <td>${it.uom}</td>
                    <td class="text-right">${it.unitPrice}</td>
                    <td class="text-right">${it.lineTotal}</td>
                  </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
            <table class="summary">
              <tr><td>Subtotal</td><td class="text-right">${detail.subtotal}</td></tr>
              <tr><td>Diskon</td><td class="text-right">${detail.discountAmount}</td></tr>
              <tr class="total"><td>Total</td><td class="text-right">${detail.totalAmount}</td></tr>
            </table>
            <div style="margin-top: 20px;"><strong>Catatan:</strong> ${escapeHtml(detail.notes || "-")}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mencetak Sales Order");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sales Order</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Membuat order penjualan (belum memotong stok). Stok akan dipotong saat Surat Jalan dibuat.
          </p>
        </div>
        {offlineOrders.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setError(null);
                setIsFormOpen(true);
              }}
            >
              Tambah Sales Order
            </Button>
            <Button variant="secondary" onClick={handleSync} disabled={syncing || isOffline} className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Menyinkronkan...' : `Sync ${offlineOrders.length} Offline Orders`}
            </Button>
          </div>
        )}
        {offlineOrders.length === 0 ? (
          <Button
            onClick={() => {
              setError(null);
              setIsFormOpen(true);
            }}
          >
            Tambah Sales Order
          </Button>
        ) : null}
      </div>

      {isOffline && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CloudOff className="h-4 w-4" />
          <span>Anda sedang offline. Data master menggunakan versi tersimpan. Order akan disimpan di perangkat.</span>
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Sales Order</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No</th>
                <th className="px-4 py-2">Pelanggan</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Status SO</th>
                <th className="px-4 py-2">Status Kirim</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-blue-600">
                    {o.orderNo}
                  </td>
                  <td className="px-4 py-2">{o.customerName}</td>
                  <td className="px-4 py-2 text-zinc-600">{o.orderDate}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        o.status === "DRAFT"
                          ? "bg-zinc-100 text-zinc-700"
                          : o.status === "PENDING_APPROVAL"
                          ? "bg-orange-100 text-orange-700"
                          : o.status === "CONFIRMED"
                          ? "bg-blue-100 text-blue-700"
                          : o.status === "DELIVERED"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {o.status === "PENDING_APPROVAL" ? "MENUNGGU PERSETUJUAN" : o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.deliveryStatus === "DELIVERED" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                      {o.deliveryStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium">Rp {o.totalAmount}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => handleView(o.id)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEdit(o.id)}
                        disabled={isOffline || o.deliveryStatus !== "PENDING"}
                        title={o.deliveryStatus !== "PENDING" ? "SO yang sudah dikirim tidak dapat diubah." : ""}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(o)}
                        disabled={isOffline || o.deliveryStatus !== "PENDING"}
                        title={o.deliveryStatus !== "PENDING" ? "SO yang sudah dikirim tidak dapat dihapus." : ""}
                      >
                        Delete
                      </Button>
                      <Button size="sm" onClick={() => handlePrint(o.id)}>
                        Cetak
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
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

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl p-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{editingOrderId ? "Edit Sales Order" : "Buat Sales Order"}</div>
                <p className="text-xs text-zinc-500">Lengkapi pelanggan, tanggal, lalu item order.</p>
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
                <div className="mb-1 text-xs font-medium text-zinc-600">Pelanggan</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={customerId}
                  onChange={(e) => {
                    const newCustId = e.target.value;
                    setCustomerId(newCustId);
                    const c = customers.find(x => x.id === newCustId);
                    if (c) {
                      setItems(prev => prev.map(it => {
                        const p = products.find(x => x.id === it.productId);
                        if (p) {
                          return { ...it, unitPrice: resolveUnitPrice(p, c, it.uom) };
                        }
                        return it;
                      }));
                    }
                  }}
                >
                  <option value="">Pilih pelanggan</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </label>

            <Input label="Tanggal" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            <Input label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />

            <div className="rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
                Item
              </div>
              <div className="grid gap-2 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2">
                    <select
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      value={it.productId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = products.find((x) => x.id === pid);
                        const c = customers.find((x) => x.id === customerId);
                        const newPrice = resolveUnitPrice(p, c, it.uom);

                        setItems((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, productId: pid, unitPrice: newPrice ?? x.unitPrice }
                              : x,
                          ),
                        );
                      }}
                    >
                      <option value="">Pilih produk</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <NumericInput
                        label="Qty"
                        value={it.qty}
                        onValueChange={(v) =>
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, qty: v || "0" } : x)),
                          )
                        }
                      />
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-zinc-600">Satuan</div>
                        <select
                          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                          value={it.uom}
                          onChange={(e) => {
                            const nextUom = e.target.value as "pcs" | "pack" | "dus";
                            const p = products.find((x) => x.id === it.productId);
                            const c = customers.find((x) => x.id === customerId);
                            const nextPrice = resolveUnitPrice(p, c, nextUom);
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, uom: nextUom, unitPrice: nextPrice } : x,
                              ),
                            );
                          }}
                        >
                          <option value="pcs">pcs</option>
                          <option value="pack">pack</option>
                          <option value="dus">dus</option>
                        </select>
                      </label>
                    </div>
                    <NumericInput
                      label="Harga"
                      mode="currency"
                      value={it.unitPrice}
                      onValueChange={(v) =>
                        setItems((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, unitPrice: v || "0" } : x,
                          ),
                        )
                      }
                    />
                    <div className="flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setItems((prev) =>
                            prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
                          )
                        }
                        disabled={items.length === 1}
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
                <Button disabled={!canSubmit} onClick={handleSubmit}>
                  {editingOrderId ? "Simpan Perubahan" : "Simpan SO"}
                </Button>
              </div>
            </div>
        </Card>
        </div>
      ) : null}

      {isViewOpen && viewOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Detail Sales Order</div>
                <p className="text-xs text-zinc-500">
                  {viewOrder.orderNo} • {viewOrder.customerCode} - {viewOrder.customerName}
                </p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => setIsViewOpen(false)}
              >
                Tutup
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">Tanggal:</span> {viewOrder.orderDate}</div>
              <div><span className="text-zinc-500">Status SO:</span> {viewOrder.status}</div>
              <div><span className="text-zinc-500">Status Kirim:</span> {viewOrder.deliveryStatus}</div>
              <div><span className="text-zinc-500">Total:</span> {viewOrder.totalAmount}</div>
              <div className="col-span-2"><span className="text-zinc-500">Catatan:</span> {viewOrder.notes || "-"}</div>
            </div>
            <div className="mt-4 overflow-auto rounded-lg border border-zinc-200">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Produk</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">UOM</th>
                    <th className="px-3 py-2 text-right">Harga</th>
                    <th className="px-3 py-2 text-right">Diskon</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewOrder.items.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-100">
                      <td className="px-3 py-2">{it.sku}</td>
                      <td className="px-3 py-2">{it.productName}</td>
                      <td className="px-3 py-2 text-right">{it.qty}</td>
                      <td className="px-3 py-2">{it.uom}</td>
                      <td className="px-3 py-2 text-right">{it.unitPrice}</td>
                      <td className="px-3 py-2 text-right">{it.discountAmount}</td>
                      <td className="px-3 py-2 text-right">{it.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
