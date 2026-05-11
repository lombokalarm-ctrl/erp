# SOP Singkat Sprint C+ (Operasional)

## Tujuan
- Menstandarkan penggunaan fitur Sprint C+ di tim gudang dan purchasing.
- Menghindari duplikasi transfer serta memastikan rekomendasi replenishment relevan.

## A. Atur Parameter Produk
1. Buka `Master Data -> Produk`.
2. Pada produk yang diatur, isi:
- `Min Stock Base`
- `Reorder Qty Base`
- `Lead Time Days`
- `Buffer Days`
3. Simpan perubahan.

Aturan praktis:
- `Lead Time Days`: waktu rata-rata barang datang sejak PO dibuat.
- `Buffer Days`: cadangan hari untuk antisipasi keterlambatan/permintaan naik.

## B. Jalankan Replenishment Harian
1. Buka `Inventory -> Replenishment`.
2. Isi `Lookback (hari)`:
- `7-14` untuk barang fast moving.
- `30` untuk barang normal (default).
3. Klik `Muat`.
4. Fokus ke SKU dengan `Kekurangan` dan `Rekomendasi PO` terbesar.
5. Pilih SKU yang akan dibeli, lalu klik `Buat Draft PO dari Rekomendasi`.

## C. Standar Transfer Gudang
1. Buka `Inventory -> Transfer Gudang`.
2. Isi gudang asal, gudang tujuan, tanggal, item, dan qty.
3. Isi `Client Ref` untuk semua transfer dari integrasi/app mobile.
4. Klik `Simpan Transfer`.

Standar `Client Ref`:
- Format disarankan: `<sumber>-<tanggal>-<nomor>`
- Contoh: `mobile-20260511-0001`
- Harus unik untuk mencegah duplikasi transfer.

## D. Export Dokumen
1. Dari tab `Replenishment`, gunakan tombol `Excel` atau `PDF` untuk dokumen rekomendasi.
2. Dari tab `Transfer Gudang`, gunakan `Excel Transfer` atau `PDF Transfer` untuk dokumen mutasi.
3. Simpan file export sesuai nama periode operasional.

## E. Kontrol Harian (5-10 Menit)
1. Buka `Dashboard`.
2. Cek 3 KPI:
- `SKU Alert Replenishment`
- `Estimasi Nilai Replenishment`
- `Transfer Gudang Hari Ini`
3. Jika KPI tidak sesuai ekspektasi, validasi kembali input `lead/buffer`, `lookback`, dan transfer terakhir.

## F. Penanganan Cepat
- Rekomendasi terlalu besar: turunkan `lookback`, cek outlier penjualan, lalu evaluasi `buffer`.
- SKU yang seharusnya alert tidak muncul: cek `minStockBase` dan stok base aktual.
- Transfer tercatat ganda: pastikan `Client Ref` tidak berubah saat retry.
