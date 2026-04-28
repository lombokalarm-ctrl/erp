import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";

type Customer = {
  id: string;
  code: string;
  name: string;
  ownerName?: string | null;
  ktpNo?: string | null;
  npwpNo?: string | null;
  category: string;
  phone: string | null;
  address: string | null;
  status: string;
  salesId?: string | null;
  salesName?: string | null;
};

type CreditProfile = {
  customerId: string;
  creditLimit: string;
  salesOrderLimit: string;
  paymentTermDays: number;
  maxOverdueDaysBeforeBlock: number | null;
};

export default function Customers() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [credit, setCredit] = useState<CreditProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ktpNo, setKtpNo] = useState("");
  const [npwpNo, setNpwpNo] = useState("");
  const [category, setCategory] = useState("RETAIL");
  const [status, setStatus] = useState("ACTIVE");
  const [salesId, setSalesId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [salesList, setSalesList] = useState<{id: string, fullName: string}[]>([]);
  const authUser = useAuthStore(s => s.user);
  const isSalesRole = authUser?.role === "Sales";

  const canCreate = useMemo(() => code.trim() && name.trim(), [code, name]);

  function handleEdit(c: Customer) {
    setEditingId(c.id);
    setCode(c.code);
    setName(c.name);
    setOwnerName(c.ownerName || "");
    setKtpNo(c.ktpNo || "");
    setNpwpNo(c.npwpNo || "");
    setCategory(c.category);
    setStatus(c.status);
    setSalesId(c.salesId || "");
    setSelected(c);
    loadCredit(c.id).catch(() => setCredit(null));
  }

  function handleCancelEdit() {
    setEditingId(null);
    setCode("");
    setName("");
    setOwnerName("");
    setKtpNo("");
    setNpwpNo("");
    setCategory("RETAIL");
    setStatus("ACTIVE");
    setSalesId("");
    setSelected(null);
    setCredit(null);
    setError(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus pelanggan ini?")) return;
    try {
      await apiFetch(`/api/v1/customers/${id}`, { method: "DELETE" });
      if (selected?.id === id) handleCancelEdit();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus pelanggan");
    }
  }

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=50&q=" + encodeURIComponent(q));
      setItems(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data");
    }
  }

  async function loadSales() {
    if (isSalesRole) return;
    try {
      const res = await apiFetch<{ data: any[] }>("/api/v1/users?role=Sales&pageSize=100");
      setSalesList(res.data.map(u => ({ id: u.id, fullName: u.fullName })));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    loadSales();
  }, []);

  async function loadCredit(id: string) {
    const res = await apiFetch<{ data: CreditProfile | null }>(`/api/v1/customers/${id}/credit-profile`);
    setCredit(res.data);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Pelanggan</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola toko/retail beserta limit kredit dan tempo.</p>
        </div>
        <div className="flex gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama..." />
          </div>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Pelanggan</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-2">Kode</th>
                  <th className="px-4 py-2">Nama</th>
                  <th className="px-4 py-2">Nama Pemilik</th>
                  <th className="px-4 py-2">No KTP</th>
                  <th className="px-4 py-2">No NPWP</th>
                  <th className="px-4 py-2">Kategori</th>
                  <th className="px-4 py-2">Sales</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 ${selected?.id === c.id ? "bg-zinc-50" : ""}`}
                    onClick={() => {
                      if (editingId && editingId !== c.id) return;
                      setSelected(c);
                      loadCredit(c.id).catch(() => setCredit(null));
                    }}
                  >
                    <td className="px-4 py-2 font-medium">{c.code}</td>
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{c.ownerName || "-"}</td>
                    <td className="px-4 py-2">{c.ktpNo || "-"}</td>
                    <td className="px-4 py-2">{c.npwpNo || "-"}</td>
                    <td className="px-4 py-2">{c.category}</td>
                    <td className="px-4 py-2 text-zinc-600">{c.salesName || "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-200 text-zinc-700"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(c); }} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="text-red-600 hover:text-red-800 font-medium">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-500" colSpan={9}>
                      Belum ada data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold">{editingId ? "Edit Pelanggan" : "Tambah Pelanggan"}</div>
            <div className="mt-3 grid gap-3">
              <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CUST-001" />
              <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="Toko Sumber Rejeki" />
              <Input label="Nama Pemilik" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Nama pemilik toko" />
              <Input label="No KTP" value={ktpNo} onChange={(e) => setKtpNo(e.target.value)} placeholder="3273xxxxxxxxxxxx" />
              <Input label="No NPWP" value={npwpNo} onChange={(e) => setNpwpNo(e.target.value)} placeholder="xx.xxx.xxx.x-xxx.xxx" />
              <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Kategori</div>
              <select
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="RETAIL">Retail</option>
                <option value="GROSIR">Grosir</option>
                <option value="MODERN RETAIL">Modern Retail</option>
                <option value="HOREKA">Hotel, Restoran & Kafe (Horeka)</option>
                <option value="NASIONAL MODERN RETAIL">Nasional Modern Retail</option>
              </select>
            </label>
            {!isSalesRole && (
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Sales PIC</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={salesId}
                  onChange={(e) => setSalesId(e.target.value)}
                >
                  <option value="">-- Tidak Ada --</option>
                  {salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {editingId && (
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Status</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </label>
            )}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  disabled={!canCreate}
                  onClick={async () => {
                    setError(null);
                    try {
                      const payload: any = { code, name, ownerName: ownerName || null, ktpNo: ktpNo || null, npwpNo: npwpNo || null, category, status };
                      if (!isSalesRole) payload.salesId = salesId || null;

                      if (editingId) {
                        await apiFetch(`/api/v1/customers/${editingId}`, {
                          method: "PATCH",
                          body: JSON.stringify(payload),
                        });
                      } else {
                        await apiFetch("/api/v1/customers", {
                          method: "POST",
                          body: JSON.stringify(payload),
                        });
                      }
                      handleCancelEdit();
                      await load();
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pelanggan");
                    }
                  }}
                >
                  {editingId ? "Update" : "Simpan"}
                </Button>
                {editingId && (
                  <Button className="flex-1" variant="secondary" onClick={handleCancelEdit}>
                    Batal
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold">Limit Kredit & Sales Order</div>
            <div className="mt-1 text-sm text-zinc-600">
              {selected ? `Untuk: ${selected.name}` : "Pilih pelanggan untuk mengatur limit kredit dan limit sales order."}
            </div>
            {selected ? (
              <CreditEditor
                key={selected.id}
                customerId={selected.id}
                initial={credit}
                onSaved={() => loadCredit(selected.id)}
              />
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CreditEditor({
  customerId,
  initial,
  onSaved,
}: {
  customerId: string;
  initial: CreditProfile | null;
  onSaved: () => void;
}) {
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit ?? "0");
  const [salesOrderLimit, setSalesOrderLimit] = useState(initial?.salesOrderLimit ?? "0");
  const [paymentTermDays, setPaymentTermDays] = useState(String(initial?.paymentTermDays ?? 0));
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-3 grid gap-3">
      <Input label="Limit Kredit" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0" />
      <Input label="Limit Sales Order" value={salesOrderLimit} onChange={(e) => setSalesOrderLimit(e.target.value)} placeholder="0" />
      <Input label="Tempo (hari)" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)} placeholder="0" />
      <Button
        variant="secondary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await apiFetch(`/api/v1/customers/${customerId}/credit-profile`, {
              method: "PUT",
              body: JSON.stringify({
                creditLimit: Number(creditLimit),
                salesOrderLimit: Number(salesOrderLimit),
                paymentTermDays: Number(paymentTermDays),
              }),
            });
            onSaved();
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Menyimpan..." : "Simpan Limit"}
      </Button>
    </div>
  );
}

