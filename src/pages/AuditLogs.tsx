import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/api/client";

type AuditLog = {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
};

export default function AuditLogs() {
  const [items, setItems] = useState<AuditLog[]>([]);

  async function load() {
    const res = await apiFetch<{ data: AuditLog[] }>("/api/v1/audit-logs?page=1&pageSize=100");
    setItems(res.data);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Audit Log</h1>
          <p className="mt-1 text-sm text-zinc-600">Jejak aktivitas untuk perubahan data kritikal.</p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Aktivitas Terbaru</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">Waktu</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2">{new Date(l.createdAt).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-2">{l.actorEmail ?? "-"}</td>
                  <td className="px-4 py-2 font-medium">{l.action}</td>
                  <td className="px-4 py-2">
                    {l.entity} {l.entityId ? `(${l.entityId.slice(0, 8)})` : ""}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500" colSpan={4}>
                    Belum ada data.
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

