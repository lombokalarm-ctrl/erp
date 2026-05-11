# UAT Sprint C+ - Replenishment & Transfer Gudang

## Tujuan
- Memastikan enhancement Sprint C+ berjalan stabil: `leadTimeDays`, `bufferDays`, `lookbackDays`, dokumen transfer `TRF`, dedupe `clientRef`, KPI dashboard, dan export transfer.

## Prasyarat
- Migrasi `028_replenishment_lead_buffer.sql` dan `029_inventory_transfer_documents.sql` sudah diterapkan.
- User uji memiliki akses `inventory:read/write`, `purchasing:read/write`, `reports:read`.
- Produk uji memiliki `minStockBase > 0`, `reorderQtyBase > 0`, dan nilai `leadTimeDays`/`bufferDays` terisi.

## Data Uji Minimum
- 2 gudang aktif.
- 2 produk dengan stok rendah.
- 1 produk dengan stok cukup (untuk kontrol pembanding).

## Checklist UAT
1. Buka `Inventory -> Replenishment`.
2. Isi `Lookback (hari)` (mis. `30`) dan klik `Muat`.
3. Verifikasi kolom baru tampil: `Lead Time`, `Buffer`, `Avg Sales`, `Target Stock`.
4. Ubah `Lookback (hari)` (mis. `7`), klik `Muat`, pastikan rekomendasi berubah sesuai periode.
5. Pilih 1-2 SKU rekomendasi lalu klik `Buat Draft PO dari Rekomendasi`.
6. Buka `Purchase Orders`, pastikan draft PO terbentuk sesuai rekomendasi terbaru.
7. Di tab `Replenishment`, klik `Excel` dan `PDF`, pastikan file terunduh dan kolom baru ikut terbawa.
8. Buka `Inventory -> Transfer Gudang`, isi gudang asal/tujuan, tanggal transfer, item, dan qty.
9. Isi `Client Ref` unik (mis. `mobile-sync-001`) lalu simpan transfer.
10. Simpan lagi payload transfer yang sama dengan `Client Ref` yang sama.
11. Verifikasi tidak terjadi duplikasi dokumen transfer (idempotent), dan daftar transfer tetap 1 dokumen.
12. Verifikasi format nomor transfer mengikuti pola `TRF-YYYYMMDD-####`.
13. Klik `Excel Transfer` dan `PDF Transfer`, pastikan daftar transfer terunduh dengan data benar.
14. Buka `Dashboard`, verifikasi KPI `SKU Alert Replenishment`, `Estimasi Nilai Replenishment`, dan `Transfer Gudang Hari Ini` tampil.
15. Cek `Kartu Stok`, pastikan transfer membentuk pasangan `TRANSFER_OUT` dan `TRANSFER_IN` seimbang.

## Kriteria Lulus
- Replenishment menghitung rekomendasi berdasarkan `min stock + konsumsi harian * (lead time + buffer)`.
- Re-submit transfer dengan `clientRef` yang sama tidak membuat transfer baru.
- Nomor transfer selalu unik dan berformat `TRF`.
- Export replenishment dan transfer (`xlsx`/`pdf`) berhasil dan angka terbaca numerik.
- KPI dashboard menampilkan angka konsisten dengan data transaksi hari berjalan.
