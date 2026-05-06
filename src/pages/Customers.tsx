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
  email: string | null;
  address: string | null;
  regionId: string | null;
  status: "ACTIVE" | "BLOCKED";
  salesId: string | null;
  salesName: string | null;
};

type Region = {
  id: string;
  name: string;
};

type CreditProfile = {
  customerId: string;
  creditLimit: string;
  salesOrderLimit: string;
  paymentTermDays: number;
  maxOverdueDaysBeforeBlock: number | null;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatRupiahDigits(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
}

const CATEGORY_OPTIONS = [
  "RETAIL",
  "GROSIR",
  "MODERN RETAIL",
  "HOREKA",
  "NASIONAL MODERN RETAIL",
] as const;

export default function Customers() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    failed: number;
    errors?: { row: number; message: string; code?: string }[];
  } | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ktpNo, setKtpNo] = useState("");
  const [npwpNo, setNpwpNo] = useState("");
  const [category, setCategory] = useState("RETAIL");
  const [status, setStatus] = useState("ACTIVE");
  const [salesId, setSalesId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [regionId, setRegionId] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [salesOrderLimit, setSalesOrderLimit] = useState("0");
  const [paymentTermDays, setPaymentTermDays] = useState("0");
  const [regions, setRegions] = useState<Region[]>([]);

  const [salesList, setSalesList] = useState<{id: string, fullName: string}[]>([]);
  const authUser = useAuthStore(s => s.user);
  const isSalesRole = authUser?.role === "Sales";
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"name" | "code" | "category" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const canCreate = useMemo(() => code.trim() && name.trim(), [code, name]);
  const filteredItems = useMemo(() => {
    const filtered = items.filter((c) => {
      const statusMatch = statusFilter === "ALL" || c.status === statusFilter;
      const categoryMatch = categoryFilter === "ALL" || c.category === categoryFilter;
      return statusMatch && categoryMatch;
    });
    const factor = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortBy] ?? "").toLowerCase();
      const bv = String(b[sortBy] ?? "").toLowerCase();
      return av.localeCompare(bv) * factor;
    });
  }, [items, statusFilter, categoryFilter, sortBy, sortDir]);

  function handleOpenCreate() {
    setEditingId(null);
    setCode("");
    setName("");
    setOwnerName("");
    setKtpNo("");
    setNpwpNo("");
    setCategory("RETAIL");
    setStatus("ACTIVE");
    setSalesId("");
    setPhone("");
    setEmail("");
    setAddress("");
    setRegionId("");
    setCreditLimit("0");
    setSalesOrderLimit("0");
    setPaymentTermDays("0");
    setError(null);
    setIsFormOpen(true);
  }

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
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setAddress(c.address || "");
    setRegionId(c.regionId || "");
    setSelected(c);
    loadCredit(c.id)
      .then((profile) => {
        setCreditLimit(onlyDigits(profile?.creditLimit ?? "0") || "0");
        setSalesOrderLimit(profile?.salesOrderLimit ?? "0");
        setPaymentTermDays(String(profile?.paymentTermDays ?? 0));
      })
      .catch(() => {
        setCreditLimit("0");
        setSalesOrderLimit("0");
        setPaymentTermDays("0");
      });
    setIsFormOpen(true);
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
    setPhone("");
    setEmail("");
    setAddress("");
    setRegionId("");
    setCreditLimit("0");
    setSalesOrderLimit("0");
    setPaymentTermDays("0");
    setSelected(null);
    setError(null);
    setIsFormOpen(false);
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
    loadRegions();
  }, []);

  async function loadRegions() {
    try {
      const res = await apiFetch<{ data: Region[] }>("/api/v1/regions");
      setRegions(res.data);
    } catch (err: any) {
      console.error(err);
    }
  }

  async function loadCredit(id: string) {
    const res = await apiFetch<{ data: CreditProfile | null }>(`/api/v1/customers/${id}/credit-profile`);
    return res.data;
  }

  async function handleSaveCustomer() {
    setError(null);
    try {
      const payload: any = {
        code,
        name,
        ownerName: ownerName || undefined,
        ktpNo: ktpNo || undefined,
        npwpNo: npwpNo || undefined,
        category,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        regionId: regionId || undefined,
        status,
      };
      if (!isSalesRole) {
        payload.salesId = salesId || null;
      }

      let customerId = editingId;
      if (editingId) {
        await apiFetch(`/api/v1/customers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiFetch<{ data: Customer }>("/api/v1/customers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        customerId = created.data.id;
      }

      if (customerId) {
        await apiFetch(`/api/v1/customers/${customerId}/credit-profile`, {
          method: "PUT",
          body: JSON.stringify({
            creditLimit: Number(onlyDigits(creditLimit) || 0),
            salesOrderLimit: Number(salesOrderLimit || 0),
            paymentTermDays: Number(paymentTermDays || 0),
          }),
        });
      }
      handleCancelEdit();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pelanggan");
    }
  }

  function downloadTemplate() {
    const headers = [
      "code",
      "name",
      "owner_name",
      "ktp_no",
      "npwp_no",
      "category",
      "phone",
      "email",
      "address",
      "region_name",
      "status",
      "sales_email",
      "credit_limit",
      "sales_order_limit",
      "payment_term_days",
    ];
    const sample = [
      "CUST-001",
      "Toko Maju Jaya",
      "Budi Santoso",
      "3273010101010001",
      "12.345.678.9-012.345",
      "RETAIL",
      "081234567890",
      "owner@tokomaju.id",
      "Jl. Merdeka No. 1",
      "Bandung Timur",
      "ACTIVE",
      "sales1@apli.my.id",
      "5000000",
      "2000000",
      "30",
    ];
    const csv = `${headers.join(",")}\n${sample.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "template-import-pelanggan.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!importFile) {
      setError("Pilih file CSV/XLSX terlebih dahulu");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await apiFetch<{
        data: {
          total: number;
          created: number;
          updated: number;
          failed: number;
          errors?: { row: number; message: string; code?: string }[];
        };
      }>("/api/v1/customers/import", {
        method: "POST",
        body: form,
      });
      setImportSummary(res.data);
      setImportFile(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import pelanggan gagal");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-lg font-semibold">Pelanggan</h1>
          <p className="mt-1 text-sm text-zinc-600">Kelola data pelanggan, filter cepat, dan sortir mudah dalam satu halaman.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-full md:w-72">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama..." />
          </div>
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "BLOCKED")}
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">Semua Kategori</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "code" | "category" | "status")}
          >
            <option value="name">Sort Nama</option>
            <option value="code">Sort Kode</option>
            <option value="category">Sort Kategori</option>
            <option value="status">Sort Status</option>
          </select>
          <select
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
          >
            <option value="asc">A-Z</option>
            <option value="desc">Z-A</option>
          </select>
          <Button variant="secondary" onClick={load}>
            Cari
          </Button>
          <Button onClick={handleOpenCreate}>Tambah Pelanggan Baru</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold">Import Pelanggan (CSV/Excel)</div>
            <p className="mt-1 text-xs text-zinc-600">
              Kolom wajib: <span className="font-medium">code</span>, <span className="font-medium">name</span>.
              Kolom lain opsional: owner_name, ktp_no, npwp_no, category, phone, email, address,
              region_name, status, sales_email, credit_limit, sales_order_limit, payment_term_days.
            </p>
          </div>
          <Button variant="secondary" onClick={downloadTemplate}>
            Unduh Template CSV
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm md:max-w-md"
          />
          <Button onClick={handleImport} disabled={!importFile || importing}>
            {importing ? "Mengimpor..." : "Import File"}
          </Button>
        </div>
        {importSummary ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <div>
              Total: <span className="font-semibold">{importSummary.total}</span> | Dibuat:{" "}
              <span className="font-semibold text-emerald-700">{importSummary.created}</span> | Diperbarui:{" "}
              <span className="font-semibold text-blue-700">{importSummary.updated}</span> | Gagal:{" "}
              <span className="font-semibold text-red-700">{importSummary.failed}</span>
            </div>
            {importSummary.errors?.length ? (
              <div className="mt-2 max-h-36 overflow-auto rounded border border-red-100 bg-white p-2 text-red-700">
                {importSummary.errors.slice(0, 20).map((err, idx) => (
                  <div key={idx}>
                    Baris {err.row}: {err.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="space-y-4">
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
                  <th className="px-4 py-2">Kontak</th>
                  <th className="px-4 py-2">Wilayah & Alamat</th>
                  <th className="px-4 py-2">Sales</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((c) => {
                  const regionName = regions.find(r => r.id === c.regionId)?.name || "-";
                  return (
                    <tr
                      key={c.id}
                      className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 ${selected?.id === c.id ? "bg-zinc-50" : ""}`}
                      onClick={() => {
                        if (editingId && editingId !== c.id) return;
                        setSelected(c);
                      }}
                    >
                      <td className="px-4 py-2 font-medium">{c.code}</td>
                      <td className="px-4 py-2">{c.name}</td>
                      <td className="px-4 py-2">{c.ownerName || "-"}</td>
                      <td className="px-4 py-2">{c.ktpNo || "-"}</td>
                      <td className="px-4 py-2">{c.npwpNo || "-"}</td>
                      <td className="px-4 py-2">{c.category}</td>
                      <td className="px-4 py-2">
                        <div className="text-xs">{c.phone || "-"}</div>
                        <div className="text-xs text-zinc-500">{c.email || "-"}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs font-medium">{regionName}</div>
                        <div className="text-xs text-zinc-500 truncate max-w-[150px]" title={c.address || ""}>{c.address || "-"}</div>
                      </td>
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
                  );
                })}
                {filteredItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-zinc-500" colSpan={11}>
                      Tidak ada data sesuai filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl max-h-[92vh] overflow-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{editingId ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}</div>
                <p className="text-xs text-zinc-500">Lengkapi informasi identitas, wilayah, dan PIC sales pelanggan.</p>
              </div>
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={handleCancelEdit}
              >
                Tutup
              </button>
            </div>
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
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="No Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Limit Kredit (Rp)</div>
                <input
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  type="text"
                  inputMode="numeric"
                  value={formatRupiahDigits(creditLimit)}
                  onChange={(e) => setCreditLimit(onlyDigits(e.target.value) || "0")}
                  placeholder="0"
                />
              </label>
              <Input
                label="Limit Sales Order (Jumlah Nota)"
                type="number"
                min="0"
                value={salesOrderLimit}
                onChange={(e) => setSalesOrderLimit(e.target.value)}
                placeholder="0"
              />
              <Input
                label="Tempo Pembayaran (hari)"
                type="number"
                min="0"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
                placeholder="0"
              />
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Wilayah</div>
                <select
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                >
                  <option value="">-- Pilih Wilayah --</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Alamat Lengkap</div>
                <textarea
                  className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm min-h-[80px]"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              {!isSalesRole ? (
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
              ) : null}
              {editingId ? (
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
              ) : null}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancelEdit}>
                  Batal
                </Button>
                <Button disabled={!canCreate} onClick={handleSaveCustomer}>
                  {editingId ? "Update" : "Simpan"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

