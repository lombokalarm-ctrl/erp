import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { Building, MapPin, Phone, Mail, FileText, Globe } from "lucide-react";

type CompanySettingsData = {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  website: string;
};

export default function CompanySettings() {
  const [data, setData] = useState<CompanySettingsData>({
    name: "",
    address: "",
    phone: "",
    email: "",
    taxNumber: "",
    website: "",
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch<{ data: CompanySettingsData }>("/api/v1/settings/company")
      .then((res) => {
        setData(res.data);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Gagal memuat pengaturan");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!data.name.trim()) {
      setError("Nama perusahaan wajib diisi");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await apiFetch<{ data: CompanySettingsData }>("/api/v1/settings/company", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setData(res.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Memuat pengaturan...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Profil Perusahaan</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kelola informasi detail perusahaan yang akan ditampilkan pada dokumen dan struk.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Profil perusahaan berhasil diperbarui!
        </div>
      )}

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Nama Perusahaan <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                placeholder="PT Sukses Makmur"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Alamat Lengkap
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <textarea
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                value={data.address}
                onChange={(e) => setData({ ...data, address: e.target.value })}
                placeholder="Jl. Raya Kemerdekaan No. 123..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Nomor Telepon
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                  placeholder="021-1234567"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                  placeholder="info@perusahaan.com"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                NPWP / Tax Number
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={data.taxNumber}
                  onChange={(e) => setData({ ...data, taxNumber: e.target.value })}
                  placeholder="01.234.567.8-901.000"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Website
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={data.website}
                  onChange={(e) => setData({ ...data, website: e.target.value })}
                  placeholder="www.perusahaan.com"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-5 mt-2 flex justify-end">
            <Button onClick={handleSave} disabled={saving || !data.name.trim()}>
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}