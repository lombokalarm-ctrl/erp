import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { RotateCcw } from "lucide-react";

type ReturnRow = {
  id: string;
  returnNo: string;
  type: string;
  referenceNo: string;
  returnDate: string;
  notes: string;
  customerName: string;
  supplierName: string;
};

type Customer = { id: string; name: string; code: string };
type Supplier = { id: string; name: string; code: string };
type Product = { id: string; name: string; sku: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Returns() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"SALES_RETURN" | "PURCHASE_RETURN">("SALES_RETURN");
  const [partnerId, setPartnerId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [returnDate, setReturnDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; qty: string; reason: string }[]>([
    { productId: "", qty: "1", reason: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () => partnerId && items.every((i) => i.productId && Number(i.qty) > 0),
    [partnerId, items],
  );

  async function loadInitial() {
    const [retRes, cRes, sRes, pRes] = await Promise.all([
      apiFetch<{ data: ReturnRow[] }>("/api/v1/returns?page=1&pageSize=50"),
      apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=200"),
      apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200"),
      apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200"),
    ]);
    setRows(retRes.data);
    setCustomers(cRes.data);
    setSuppliers(sRes.data);
    setProducts(pRes.data);
  }

  useEffect(() => {
    loadInitial().catch(() => {});
  }, []);

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
          referenceNo,
          returnDate,
          notes,
          items: items.map((i) => ({ productId: i.productId, qty: Number(i.qty), reason: i.reason })),
        }),
      });

      setPartnerId("");
      setReferenceNo("");
      setNotes("");
      setItems([{ productId: "", qty: "1", reason: "" }]);
      loadInitial();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memproses retur");
    } finally {
      setSaving(false);
    }
  }

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3 border-b pb-2">Buat Tiket Retur</div>
          <div className="grid gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Tipe Retur</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as any);
                  setPartnerId("");
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
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">-- Pilih --</option>
                {type === "SALES_RETURN"
                  ? customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))
                  : suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
              </select>
            </label>

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
                    <select
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                      value={it.productId}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x))
                        )
                      }
                    >
                      <option value="">Pilih produk...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Input
                        className="w-20"
                        placeholder="Qty"
                        type="number"
                        value={it.qty}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x))
                          )
                        }
                      />
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
                          onClick={() => setItems((prev) => [...prev, { productId: "", qty: "1", reason: "" }])}
                        >
                          + Barang Lain
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button disabled={!canSubmit || saving} onClick={handleSubmit} className="mt-2">
              {saving ? "Menyimpan..." : "Simpan Retur"}
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Riwayat Retur</div>
          <div className="overflow-auto max-h-[600px]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">No Retur</th>
                  <th className="px-4 py-2">Tipe</th>
                  <th className="px-4 py-2">Partner</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Ref</th>
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
                    <td className="px-4 py-2 text-zinc-600">{r.returnDate}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{r.referenceNo || '-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-zinc-500" colSpan={5}>
                      Belum ada riwayat retur barang.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}