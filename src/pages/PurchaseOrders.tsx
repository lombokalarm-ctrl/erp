import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Supplier = { id: string; code: string; name: string };
type Product = { id: string; sku: string; name: string; purchasePrice: string };
type PoRow = { id: string; poNo: string; orderDate: string; status: string; totalAmount: string; supplierName: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseOrders() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<{ productId: string; qty: string; uom: "pcs" | "pack" | "dus"; unitPrice: string }[]>([
    { productId: "", qty: "1", uom: "pcs", unitPrice: "0" },
  ]);
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [rows, setRows] = useState<PoRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Purchase Order</h1>
        <p className="mt-1 text-sm text-zinc-600">Buat PO untuk supplier.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="p-4">
          <div className="text-sm font-semibold">Buat PO</div>
          <div className="mt-3 grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Supplier</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Pilih supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </label>

            <Input label="Tanggal" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

            <div className="rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">Item</div>
              <div className="grid gap-2 p-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid gap-2">
                    <select
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      value={it.productId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = products.find((x) => x.id === pid);
                        setItems((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, productId: pid, unitPrice: p?.purchasePrice ?? x.unitPrice } : x,
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
                      <Input type="number" min="1" label="Qty" value={it.qty} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-zinc-600">Satuan</div>
                        <select
                          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                          value={it.uom}
                          onChange={(e) => setItems((prev) => prev.map((x, i) => i === idx ? { ...x, uom: e.target.value as "pcs" | "pack" | "dus" } : x))}
                        >
                          <option value="pcs">pcs</option>
                          <option value="pack">pack</option>
                          <option value="dus">dus</option>
                        </select>
                      </label>
                    </div>
                    <Input type="number" min="0" label="Harga" value={it.unitPrice} onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: e.target.value } : x)))} />
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
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Gagal membuat PO");
                }
              }}
            >
              Simpan PO
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar PO</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">No</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium">{r.poNo}</td>
                    <td className="px-4 py-2">{r.supplierName}</td>
                    <td className="px-4 py-2">{r.orderDate}</td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2">{r.totalAmount}</td>
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
      </div>
    </div>
  );
}

