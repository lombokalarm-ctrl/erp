import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardPenLine, Phone, ReceiptText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import StatusPill from "@/components/StatusPill";
import SurfaceCard from "@/components/SurfaceCard";
import { formatCurrency, formatDate } from "@/lib/format";

type Customer = {
  id: string;
  code: string;
  name: string;
  ownerName?: string | null;
  category: string;
  phone?: string | null;
  address?: string | null;
  status: "ACTIVE" | "BLOCKED";
};

type CreditProfile = {
  customerId: string;
  creditLimit: string;
  salesOrderLimit: string;
  paymentTermDays: number;
};

type Receivable = {
  id: string;
  invoiceNo: string;
  dueDate: string;
  remainingAmount: string;
  status: string;
};

export default function CustomerDetailPage() {
  const { customerId = "" } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [creditProfile, setCreditProfile] = useState<CreditProfile | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);

  useEffect(() => {
    if (!customerId) return;
    Promise.all([
      apiFetch<{ data: Customer }>(`/api/v1/customers/${customerId}`),
      apiFetch<{ data: CreditProfile }>(`/api/v1/customers/${customerId}/credit-profile`),
      apiFetch<{ data: Receivable[] }>(`/api/v1/receivables?page=1&pageSize=8&customerId=${customerId}`),
    ]).then(([customerResponse, creditResponse, receivablesResponse]) => {
      setCustomer(customerResponse.data);
      setCreditProfile(creditResponse.data);
      setReceivables(receivablesResponse.data);
    });
  }, [customerId]);

  if (!customer) {
    return <EmptyState title="Memuat pelanggan..." description="Data pelanggan sedang diambil dari ERP." />;
  }

  const outstanding = receivables.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke pelanggan
      </Link>

      <SurfaceCard className="bg-white/90">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-500">{customer.code}</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-950">{customer.name}</div>
            <div className="mt-1 text-sm text-zinc-500">{customer.ownerName || customer.category}</div>
          </div>
          <StatusPill tone={customer.status === "ACTIVE" ? "green" : "rose"}>
            {customer.status === "ACTIVE" ? "Bisa order" : "Diblokir"}
          </StatusPill>
        </div>

        <div className="mt-4 rounded-[24px] bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <span>{customer.phone || "Nomor belum tersedia"}</span>
          </div>
          <div className="mt-2">{customer.address || "Alamat belum diisi"}</div>
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-2 gap-3">
        <SurfaceCard className="bg-white/85">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Limit Kredit</div>
          <div className="mt-2 text-xl font-semibold text-zinc-950">
            {formatCurrency(creditProfile?.creditLimit ?? 0)}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Tempo {creditProfile?.paymentTermDays ?? 0} hari</div>
        </SurfaceCard>
        <SurfaceCard className="bg-white/85">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Outstanding</div>
          <div className="mt-2 text-xl font-semibold text-zinc-950">{formatCurrency(outstanding)}</div>
          <div className="mt-1 text-sm text-zinc-500">{receivables.length} invoice aktif</div>
        </SurfaceCard>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to={`/sales-order/new?customerId=${customer.id}&customerName=${encodeURIComponent(customer.name)}`}>
          <SurfaceCard className="h-full bg-emerald-950 text-white">
            <ClipboardPenLine className="h-5 w-5 text-emerald-200" />
            <div className="mt-4 text-base font-semibold">Buat Sales Order</div>
            <div className="mt-1 text-sm text-emerald-100">Lanjut input item dan cek limit.</div>
          </SurfaceCard>
        </Link>
        <Link to={`/receivables/${customer.id}`}>
          <SurfaceCard className="h-full bg-white/85">
            <ReceiptText className="h-5 w-5 text-amber-700" />
            <div className="mt-4 text-base font-semibold text-zinc-950">Lihat Tagihan</div>
            <div className="mt-1 text-sm text-zinc-500">Invoice aktif dan overdue pelanggan.</div>
          </SurfaceCard>
        </Link>
      </div>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Invoice Aktif</div>
        <div className="mt-4 space-y-3">
          {receivables.length ? (
            receivables.map((invoice) => (
              <div key={invoice.id} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{invoice.invoiceNo}</div>
                    <div className="text-sm text-zinc-500">Jatuh tempo {formatDate(invoice.dueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-zinc-900">{formatCurrency(invoice.remainingAmount)}</div>
                    <div className="text-xs text-zinc-500">{invoice.status}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="Tidak ada invoice aktif" description="Pelanggan ini tidak memiliki tagihan aktif saat ini." />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
