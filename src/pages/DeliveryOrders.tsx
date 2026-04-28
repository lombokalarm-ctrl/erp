import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiFetch, ApiError } from "@/api/client";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";

type SalesOrderRow = {
  id: string;
  orderNo: string;
  customerName: string;
  orderDate: string;
  status: string;
  deliveryStatus: string;
  totalAmount: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DeliveryOrders() {
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [showScanner, setShowScanner] = useState(false);
  const [targetSoId, setTargetSoId] = useState<string | null>(null);

  async function load() {
    try {
      const soRes = await apiFetch<{ data: SalesOrderRow[] }>("/api/v1/sales-orders?page=1&pageSize=50");
      setOrders(soRes.data);
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeliver(soId: string) {
    if (!confirm("Buat Surat Jalan dan keluarkan barang dari Gudang Utama?")) return;
    setError(null);
    setLoadingId(soId);
    try {
      await apiFetch(`/api/v1/sales-orders/${soId}/deliver`, {
        method: "POST",
        body: JSON.stringify({ deliveryDate })
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membuat surat jalan");
    } finally {
      setLoadingId(null);
    }
  }

  async function handlePrint(soId: string) {
    try {
      const res = await apiFetch<{ data: any }>(`/api/v1/sales-orders/${soId}/delivery-order`);
      const doData = res.data;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Surat Jalan - ${doData.doNo}</title>
            <style>
              @page { size: 9.5in 5.5in; margin: 0.5in; }
              body { font-family: "Courier New", Courier, monospace; font-size: 13px; line-height: 1.4; color: #000; margin: 0; padding: 0; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
              .title { font-size: 18px; font-weight: bold; text-align: center; letter-spacing: 2px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 15px; }
              .meta-box { width: 48%; }
              .meta-box div { margin-bottom: 3px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #000; padding: 6px 10px; text-align: left; }
              th { font-weight: bold; border-bottom: 2px solid #000; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .footer { display: flex; justify-content: space-between; margin-top: 30px; text-align: center; }
              .signature { width: 30%; }
              .signature-line { margin-top: 50px; border-bottom: 1px solid #000; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <strong>PT. ERP DISTRIBUTOR F&B</strong><br/>
                Jl. Raya Distribusi No. 123<br/>
                Telp: (021) 12345678
              </div>
              <div class="title">
                SURAT JALAN
              </div>
            </div>
            
            <div class="meta">
              <div class="meta-box">
                <div><strong>No. DO :</strong> ${doData.doNo}</div>
                <div><strong>Tanggal:</strong> ${doData.deliveryDate}</div>
                <div><strong>No. SO :</strong> ${doData.soNo}</div>
              </div>
              <div class="meta-box">
                <div><strong>Kepada Yth:</strong></div>
                <div>${doData.customerCode} - ${doData.customerName}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 5%" class="text-center">No</th>
                  <th style="width: 15%">SKU</th>
                  <th style="width: 50%">Nama Barang</th>
                  <th style="width: 15%" class="text-right">Qty</th>
                  <th style="width: 15%">Satuan</th>
                </tr>
              </thead>
              <tbody>
                ${doData.items.map((it: any, i: number) => `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>${it.sku}</td>
                    <td>${it.productName}</td>
                    <td class="text-right">${it.qty}</td>
                    <td>${it.unit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              <div class="signature">
                <div>Penerima / Pelanggan</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Pengemudi / Driver</div>
                <div class="signature-line"></div>
              </div>
              <div class="signature">
                <div>Hormat Kami (Gudang)</div>
                <div class="signature-line"></div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data cetak");
    }
  }

  function handleScan(decodedText: string) {
    if (!targetSoId) return;
    setShowScanner(false);
    setTargetSoId(null);
    alert(`SKU ${decodedText} berhasil di-scan untuk Surat Jalan. (Fungsi ini dapat dikembangkan untuk validasi DO parsial).`);
  }

  return (
    <div className="space-y-4">
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => {
            setShowScanner(false);
            setTargetSoId(null);
          }}
        />
      )}
      <div>
        <h1 className="text-lg font-semibold">Surat Jalan (Pengiriman)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Proses Sales Order yang sudah disetujui & terinvoice menjadi Surat Jalan untuk memotong stok.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-sm font-semibold">Daftar Order Belum Dikirim</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">Tgl Pengiriman:</span>
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold text-zinc-500">
                <th className="px-4 py-2">No SO</th>
                <th className="px-4 py-2">Pelanggan</th>
                <th className="px-4 py-2">Tanggal SO</th>
                <th className="px-4 py-2">Status SO</th>
                <th className="px-4 py-2">Status Kirim</th>
                <th className="px-4 py-2">Total Harga</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium">{o.orderNo}</td>
                  <td className="px-4 py-2">{o.customerName}</td>
                  <td className="px-4 py-2">{o.orderDate}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        o.status === "CONFIRMED"
                          ? "bg-emerald-50 text-emerald-700"
                          : o.status === "PENDING_APPROVAL"
                          ? "bg-orange-50 text-orange-700"
                          : o.status === "CANCELLED"
                          ? "bg-red-50 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${o.deliveryStatus === 'DELIVERED' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                      {o.deliveryStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2">{o.totalAmount}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {o.deliveryStatus === 'PENDING' && o.status === 'CONFIRMED' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Scan Barcode / QR Barang"
                            onClick={() => {
                              setTargetSoId(o.id);
                              setShowScanner(true);
                            }}
                          >
                            <Camera className="h-4 w-4" />
                          </Button>
                          <Button size="sm" disabled={loadingId === o.id} onClick={() => handleDeliver(o.id)}>
                            {loadingId === o.id ? 'Memproses...' : 'Buat Surat Jalan'}
                          </Button>
                        </>
                      )}
                      {o.deliveryStatus === 'PENDING' && o.status !== 'CONFIRMED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled
                          title="SO harus CONFIRMED dan invoice harus sudah terbit sebelum bisa dibuat Surat Jalan."
                        >
                          Belum Siap
                        </Button>
                      )}
                      {o.deliveryStatus === 'DELIVERED' && (
                        <Button size="sm" variant="secondary" onClick={() => handlePrint(o.id)}>
                          Cetak DO
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-zinc-500 text-center" colSpan={7}>
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
