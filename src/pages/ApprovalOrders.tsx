import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch, ApiError } from "@/api/client";
import { ShieldAlert, Check, X } from "lucide-react";

type ApprovalRow = {
  approvalId: string;
  approvalStatus: string;
  approvalNotes: string;
  requestedAt: string;
  salesOrderId: string;
  orderNo: string;
  totalAmount: string;
  customerName: string;
  requestedByName: string;
};

export default function ApprovalOrders() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch<{ data: ApprovalRow[] }>("/api/v1/sales-orders/approvals?page=1&pageSize=50");
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat antrean approval");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleProcess(id: string, action: 'APPROVED' | 'REJECTED') {
    if (!confirm(`Apakah Anda yakin ingin ${action === 'APPROVED' ? 'MENYETUJUI' : 'MENOLAK'} order ini?`)) return;
    
    setLoadingId(id);
    try {
      await apiFetch(`/api/v1/sales-orders/approvals/${id}/process`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Gagal memproses approval");
    } finally {
      setLoadingId(null);
    }
  }

  function formatRp(n: string) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-orange-600" />
          Antrean Persetujuan Order (Override Limit)
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Daftar Sales Order yang melebihi limit kredit pelanggan dan membutuhkan persetujuan Manajer/Admin.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-3">Tanggal Request</th>
                <th className="px-4 py-3">Sales Order</th>
                <th className="px-4 py-3">Pelanggan</th>
                <th className="px-4 py-3 text-right">Nilai Order</th>
                <th className="px-4 py-3">Catatan / Alasan</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.approvalId} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-800">{new Date(r.requestedAt).toLocaleDateString('id-ID')}</div>
                    <div className="text-xs text-zinc-500">Oleh: {r.requestedByName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-blue-600">
                      {r.orderNo}
                    </span>
                    <div className="mt-1">
                      <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded font-bold">
                        MENUNGGU PERSETUJUAN
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-700">{r.customerName}</td>
                  <td className="px-4 py-3 text-right font-bold text-zinc-800">{formatRp(r.totalAmount)}</td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs">{r.approvalNotes}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleProcess(r.approvalId, 'APPROVED')}
                        disabled={loadingId === r.approvalId}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleProcess(r.approvalId, 'REJECTED')}
                        disabled={loadingId === r.approvalId}
                        className="bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"
                      >
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    <ShieldAlert className="h-8 w-8 mx-auto text-zinc-300 mb-2" />
                    Tidak ada antrean approval saat ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}