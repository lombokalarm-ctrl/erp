# UAT Sprint C - Replenishment & Transfer Gudang

## Tujuan
- Memastikan min stock alert, rekomendasi PO, transfer antar gudang, dan export replenishment berjalan konsisten.

## Prasyarat
- Migrasi `027_replenishment_controls.sql` sudah diterapkan.
- User memiliki akses `inventory:read/write`, `purchasing:read/write`, `reports:read`.
- Produk uji memiliki `minStockBase` dan `reorderQtyBase` lebih dari `0`.

## Skenario Uji
1. Buka menu `Inventory` lalu tab `Replenishment`.
2. Pilih gudang (opsional) dan klik `Muat`.
3. Verifikasi hanya SKU di bawah `Min Stock` yang tampil.
4. Cek kolom: `Stok Saat Ini`, `Min Stock`, `Kekurangan`, `Rekomendasi PO`, `Estimasi Nilai`.
5. Pilih minimal 1 baris rekomendasi.
6. Pilih supplier dan tanggal, lalu klik `Buat Draft PO dari Rekomendasi`.
7. Buka menu `Purchase Order`, pastikan draft PO baru terbentuk dan item sesuai rekomendasi.
8. Kembali ke tab `Replenishment`, klik export `Excel`, lalu pastikan angka terbaca numerik.
9. Klik export `PDF`, pastikan section ringkasan dan detail SKU muncul.
10. Buka tab `Transfer Gudang`, isi gudang asal, gudang tujuan, item produk, dan `Qty Base`.
11. Simpan transfer, lalu buka tab `Kartu Stok` dan verifikasi muncul `TRANSFER_OUT` dan `TRANSFER_IN` dengan `refId` yang sama.
12. Buka `Stok Ringkas` dan verifikasi stok berkurang di gudang asal dan bertambah di gudang tujuan.

## Kriteria Lulus
- Draft PO dapat dibuat dari rekomendasi tanpa error.
- Export replenishment (`xlsx` dan `pdf`) terdownload dan isi data sesuai filter aktif.
- Transfer antar gudang posting dua transaksi stok yang seimbang.
- Tidak ada error runtime pada halaman `Inventory`.
