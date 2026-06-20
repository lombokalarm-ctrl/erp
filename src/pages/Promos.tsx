import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { formatCurrency } from "@/lib/numberFormat";
import { formatDate } from "@/lib/date";

type Promo = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  name: string;
  promoType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minQty: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

type Product = { id: string; sku: string; name: string };

export default function Promos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [promoType, setPromoType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function load() {
    setError(null);
    try {
      const [promosRes, prodsRes] = await Promise.all([
        apiFetch<{ data: Promo[] }>("/api/v1/promos"),
        apiFetch<{ data: Product[] }>("/api/v1/products?page=1&pageSize=200")
      ]);
      setPromos(promosRes.data);
      setProducts(prodsRes.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleEdit(p: Promo) {
    setEditingId(p.id);
    setProductId(p.productId);
    setName(p.name);
    setPromoType(p.promoType);
    setDiscountValue(String(p.discountValue));
    setMinQty(String(p.minQty));
    setStartDate(p.startDate ? p.startDate.slice(0, 10) : "");
    setEndDate(p.endDate ? p.endDate.slice(0, 10) : "");
    setIsActive(p.isActive);
    setIsFormOpen(true);
  }

  function handleCancel() {
    setEditingId(null);
    setProductId("");
    setName("");
    setPromoType("PERCENTAGE");
    setDiscountValue("");
    setMinQty("1");
    setStartDate("");
    setEndDate("");
    setIsActive(true);
    setError(null);
    setIsFormOpen(false);
  }

  async function handleSave() {
    if (!productId || !name || !discountValue) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        productId,
        name,
        promoType,
        discountValue: Number(discountValue),
        minQty: Number(minQty),
        startDate: startDate || null,
        endDate: endDate || null,
        isActive
      };

      if (editingId) {
        await apiFetch(`/api/v1/promos/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/v1/promos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      handleCancel();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan promo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus promo ini?")) return;
    try {
      await apiFetch(`/api/v1/promos/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Gagal menghapus promo");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Manajemen Promo & Diskon</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Atur diskon produk berdasarkan persentase/nominal, periode, dan minimum pembelian.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold flex items-center justify-between">
          <span>Daftar Promo</span>
          <Button
            size="sm"
            onClick={() => {
              handleCancel();
              setIsFormOpen(true);
            }}
          >
            Tambah Promo
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Program Promo</th>
                <th className="px-4 py-3">Diskon</th>
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.productName}</div>
                    <div className="text-xs text-zinc-500">{p.productSku}</div>
                  </td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="min-w-[140px] whitespace-nowrap px-4 py-3">
                    <div className="font-medium text-emerald-600">
                      {p.promoType === 'PERCENTAGE' ? `${p.discountValue}%` : formatCurrency(p.discountValue)}
                    </div>
                    <div className="text-xs text-zinc-500">Min: {p.minQty} pcs</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.startDate ? formatDate(p.startDate) : 'Selamanya'}
                    {' - '}
                    {p.endDate ? formatDate(p.endDate) : 'Selamanya'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                      {p.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => handleEdit(p)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" className="ml-2 bg-red-50 text-red-600 hover:bg-red-100" onClick={() => handleDelete(p.id)}>
                      Hapus
                    </Button>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    Belum ada data promo
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
                <div className="text-base font-semibold">{editingId ? "Edit Promo" : "Tambah Promo Baru"}</div>
                <p className="text-xs text-zinc-500">Atur produk, tipe diskon, nilai, dan periode promo.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={handleCancel}
              >
                Tutup
              </button>
            </div>
            <div className="space-y-3 mt-3">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Produk</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">Pilih produk</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} - {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <Input
                label="Nama Program Promo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Diskon Akhir Tahun"
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Tipe Diskon</div>
                  <select
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                    value={promoType}
                    onChange={(e) => setPromoType(e.target.value as any)}
                  >
                    <option value="PERCENTAGE">Persen (%)</option>
                    <option value="FIXED_AMOUNT">Nominal (Rp)</option>
                  </select>
                </label>

                <NumericInput
                  label="Nilai Diskon"
                  mode={promoType === "PERCENTAGE" ? "decimal" : "currency"}
                  value={discountValue}
                  onValueChange={setDiscountValue}
                  placeholder={promoType === 'PERCENTAGE' ? "Contoh: 10" : "Contoh: 5000"}
                />
              </div>

              <NumericInput
                label="Minimal Beli (Qty)"
                value={minQty}
                onValueChange={(v) => setMinQty(v || "0")}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Mulai Tanggal"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="Sampai Tanggal"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                <span>Promo Aktif</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel}>Batal</Button>
                <Button disabled={saving || !productId || !name || !discountValue} onClick={handleSave}>
                  {saving ? "Menyimpan..." : "Simpan"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
