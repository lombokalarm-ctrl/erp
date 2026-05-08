# SOP Operasional UOM V2 (Non-Teknis)

## Tujuan

Panduan singkat untuk tim operasional dalam:
- menambah satuan baru,
- memasang mapping satuan per produk,
- memastikan harga dan transaksi berjalan konsisten.

## A. Menambah Satuan Baru

1. Buka menu `Master Data -> Satuan (UOM)`.
2. Klik `Tambah Satuan`.
3. Isi:
   - `Kode` (contoh: `bal`, `karung`, `lusin`)
   - `Nama` (contoh: `Bal`, `Karung`, `Lusin`)
4. Pastikan status `Aktif`.
5. Klik `Simpan`.

Catatan:
- Kode satuan sebaiknya unik dan konsisten.
- Hindari mengganti kode yang sudah dipakai transaksi.

## B. Mapping Satuan per Produk

1. Buka menu `Master Data -> Produk`.
2. Pada produk target, klik tombol `UOM`.
3. Pastikan ada minimal:
   - 1 satuan base dengan `faktor = 1`
   - 1 `Default Sale`
   - 1 `Default Purchase`
4. Tambahkan satuan lain sesuai kebutuhan (contoh `lusin`, `bal`, `karung`) dan isi faktor ke base.
5. Klik `Simpan Mapping`.

Contoh:
- `pcs = 1`
- `lusin = 12`
- `bal = 120`

Artinya:
- 1 lusin = 12 pcs
- 1 bal = 120 pcs

## C. Setting Harga UOM Dinamis

1. Buka `Produk -> Edit`.
2. Isi `Harga Jual (Dasar)` dan `Harga Beli (Dasar)`.
3. Pada tabel harga kategori dinamis:
   - isi harga per UOM sesuai kebutuhan (mis. `pcs`, `lusin`, `bal`).
4. Klik `Simpan`.

Catatan:
- Jika harga kategori/UOM belum diisi, sistem dapat fallback ke harga dasar sesuai faktor.

## D. Operasional Transaksi

Saat membuat SO / PO / GRN / Retur:
- Pilihan satuan di dropdown akan mengikuti mapping produk.
- Pilih satuan sesuai transaksi nyata di lapangan.
- Pastikan qty dan harga satuan sudah sesuai sebelum simpan.

## E. Kontrol Harian (5 Menit)

1. Buka menu `Laporan -> Health UOM V2`.
2. Cek indikator berikut:
   - `Mapping Tidak Valid` harus 0.
   - `Transaksi Missing Base` harus 0.
3. Jika ada anomali, laporkan ke admin sistem sebelum lanjut input massal.

## F. Penanganan Masalah Umum

- **Satuan tidak muncul di transaksi**
  - Cek satuan sudah `Aktif` di master UOM.
  - Cek mapping produk sudah memasukkan satuan tersebut.

- **Produk tidak muncul saat retur sales**
  - Pastikan invoice sumber sudah dipilih.
  - Produk yang muncul hanya produk dari invoice tersebut.

- **Harga terasa tidak sesuai**
  - Cek mapping faktor UOM produk.
  - Cek harga kategori per UOM di form produk.

## G. Aturan Disiplin Data

- Jangan hapus satuan yang sudah dipakai transaksi.
- Hindari edit besar saat jam operasional padat.
- Untuk perubahan massal UOM, lakukan di luar jam sibuk dan verifikasi lewat halaman Health UOM V2.
