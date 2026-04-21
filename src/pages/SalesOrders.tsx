import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type Customer = { id: string; name: string; code: string; category: string };
type Product = { id: string; name: string; sku: string; salePrice: string; categoryPrices?: Record<string, number> };

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesOrders() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [items, setItems] = useState<
    { productId: string; qty: string; unitPrice: string }[]
  >([{ productId: "", qty: "1", unitPrice: "0" }]);

  const canSubmit = useMemo(
    () => customerId && items.every((i) => i.productId && Number(i.qty) > 0),
    [customerId, items],
  );

  async function loadInitial() {
    const [cRes, pRes, soRes] = await Promise.all([
      apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=100"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
      apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=50"),
    ]);
    setCustomers(cRes.data);
    setProducts(pRes.data);
    setOrders(soRes.data);
  }

  useEffect(() => {
    loadInitial().catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Sales Order</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Membuat order penjualan (belum memotong stok). Stok akan dipotong saat Surat Jalan dibuat.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="p-4">
          <div className="text-sm font-semibold">Buat Sales Order</div>
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
                        let newPrice = p.salePrice;
                        if (p.categoryPrices && p.categoryPrices[c.category] !== undefined) {
                          newPrice = String(p.categoryPrices[c.category]);
                        }
                        return { ...it, unitPrice: newPrice };
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
                        let newPrice = p?.salePrice;
                        if (p && c && p.categoryPrices && p.categoryPrices[c.category] !== undefined) {
                          newPrice = String(p.categoryPrices[c.category]);
                        }

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
                      <Input
                        label="Qty"
                        value={it.qty}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        label="Harga"
                        value={it.unitPrice}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, unitPrice: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
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
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", unitPrice: "0" }])}
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
                  const payload = {
                    customerId,
                    orderDate,
                    items: items.map((i) => ({
                      productId: i.productId,
                      qty: Number(i.qty),
                      unitPrice: Number(i.unitPrice),
                    })),
                  };
                  await apiFetch("/api/v1/sales-orders", { method: "POST", body: JSON.stringify(payload) });
                  setCustomerId("");
                  setItems([{ productId: "", qty: "1", unitPrice: "0" }]);
                  const soRes = await apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=50");
                  setOrders(soRes.data);
                } catch (e) {
                  if (e instanceof ApiError) {
                    setError(e.message);
                    return;
                  }
                  setError("Gagal membuat SO");
                }
              }}
            >
              Simpan SO
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Sales Order</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">No</th>
                  <th className="px-4 py-2">Pelanggan</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Status Kirim</th>
                  <th className="px-4 py-2">Total</th>
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
                    <td className="px-4 py-2 text-right font-medium">Rp {o.totalAmount}</td>
                  </tr>
                ))}
                {orders.length === 0 ? (
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
