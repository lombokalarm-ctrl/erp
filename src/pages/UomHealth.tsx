import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";

type UomHealthData = {
  summary: {
    activeUoms: number;
    totalProducts: number;
    mappedProducts: number;
    invalidMappingProducts: number;
    transactionsMissingBaseFields: number;
  };
  invalidProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    baseMappingCount: number;
    baseUomMatchesMapping: boolean;
  }>;
  conversionSources: Array<{
    source: string;
    total: number;
  }>;
};

export default function UomHealth() {
  const [data, setData] = useState<UomHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: UomHealthData }>("/api/v1/dashboard/uom-v2-health");
      setData(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat health-check UOM V2");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Health Check UOM V2</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Monitor integritas mapping satuan dan konsistensi data transaksi basis.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Memuat..." : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs text-zinc-500">UOM Aktif</div>
          <div className="mt-1 text-2xl font-bold">{data?.summary.activeUoms ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500">Total Produk</div>
          <div className="mt-1 text-2xl font-bold">{data?.summary.totalProducts ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500">Produk Bermapping</div>
          <div className="mt-1 text-2xl font-bold">{data?.summary.mappedProducts ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500">Mapping Tidak Valid</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{data?.summary.invalidMappingProducts ?? "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-zinc-500">Transaksi Missing Base</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{data?.summary.transactionsMissingBaseFields ?? "—"}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Distribusi Conversion Source</div>
        <div className="px-4 py-3">
          {data?.conversionSources?.length ? (
            <div className="flex flex-wrap gap-2">
              {data.conversionSources.map((row) => (
                <span key={row.source} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                  {row.source}: {row.total}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Belum ada data conversion source.</div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Produk Dengan Mapping Bermasalah</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Nama Produk</th>
                <th className="px-4 py-2">Base Mapping Count</th>
                <th className="px-4 py-2">Base UOM Match</th>
              </tr>
            </thead>
            <tbody>
              {data?.invalidProducts?.map((p) => (
                <tr key={p.productId} className="border-b border-zinc-100">
                  <td className="px-4 py-2 font-medium">{p.sku}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.baseMappingCount}</td>
                  <td className="px-4 py-2">{p.baseUomMatchesMapping ? "Ya" : "Tidak"}</td>
                </tr>
              ))}
              {!data?.invalidProducts?.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                    Tidak ada anomali mapping. Kondisi sehat.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
