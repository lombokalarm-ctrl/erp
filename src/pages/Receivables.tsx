import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { apiFetch } from "@/api/client";

type Receivable = {
  id: string;
  invoiceNo: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
};

type Aging = {
  "0_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
};

export default function Receivables() {
  const [items, setItems] = useState<Receivable[]>([]);
  const [aging, setAging] = useState<Aging | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ data: Receivable[] }>("/api/v1/receivables?page=1&pageSize=50"),
      apiFetch<{ data: Aging }>("/api/v1/receivables/aging"),
    ])
      .then(([l, a]) => {
        setItems(l.data);
        setAging(a.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Piutang</h1>
        <p className="mt-1 text-sm text-zinc-600">Daftar piutang pelanggan dan aging.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["0–30", "0_30"],
          ["31–60", "31_60"],
          ["61–90", "61_90"],
          [">90", "90_plus"],
        ].map(([label, key]) => (
          <Card key={key} className="p-4">
            <div className="text-xs font-medium text-zinc-500">Aging</div>
            <div className="mt-1 text-sm font-semibold">{label} hari</div>
            <div className="mt-2 text-xl font-semibold tracking-tight">
              {aging ? String(aging[key as keyof Aging]) : "—"}
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">Daftar Piutang</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">Invoice</th>
                <th className="px-4 py-2">Pelanggan</th>
                <th className="px-4 py-2">Jatuh Tempo</th>
                <th className="px-4 py-2">Sisa</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{r.invoiceNo}</td>
                  <td className="px-4 py-2">{r.customerName}</td>
                  <td className="px-4 py-2">{r.dueDate}</td>
                  <td className="px-4 py-2">{r.remainingAmount}</td>
                  <td className="px-4 py-2">{r.status}</td>
                </tr>
              ))}
              {items.length === 0 ? (
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
  );
}

