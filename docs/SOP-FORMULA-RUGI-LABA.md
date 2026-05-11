# SOP Formula Rugi Laba (Gross Profit)

## Tujuan
- Menetapkan kaidah tunggal perhitungan laporan rugi laba agar konsisten antara layar, export, dan audit.

## Ruang Lingkup
- Berlaku untuk laporan `Laba Kotor` pada modul reporting ERP.
- Berlaku untuk semua output: kartu KPI, waterfall, tabel kategori, tabel SKU, PDF, dan Excel.

## Definisi Komponen
- `Gross Sales`: total nilai penjualan sebelum diskon dan sebelum retur.
- `Diskon`: total potongan transaksi penjualan.
- `Retur Penjualan (Net)`: nilai net retur penjualan yang mengurangi penjualan bersih.
- `Net Sales`: nilai penjualan setelah diskon dan retur.
- `HPP Sales`: biaya pokok dari barang yang terjual (keluar).
- `HPP Retur`: biaya pokok dari barang yang diretur (masuk kembali).
- `HPP Net`: biaya pokok bersih setelah memperhitungkan retur.
- `Gross Profit`: laba kotor sebelum biaya operasional.

## Rumus Resmi
- `Net Sales = Gross Sales - Diskon - Retur Penjualan (Net)`
- `HPP Net = HPP Sales - HPP Retur`
- `Gross Profit = Net Sales - HPP Net`
- `Margin Laba Kotor (%) = Gross Profit / Net Sales * 100`

## Kaidah Data
- Semua perhitungan kuantitas biaya pokok menggunakan `qty_base`.
- Nilai retur penjualan wajib mengurangi `Net Sales` dan juga mengurangi `HPP`.
- Tidak boleh mencampur satuan input transaksi (`dus/pack/pcs`) langsung ke formula biaya pokok tanpa normalisasi `qty_base`.

## Kaidah Tampilan & Export
- Label wajib konsisten: gunakan istilah `HPP Net`, bukan istilah ambigu.
- Angka yang ditampilkan dan diekspor menggunakan pembulatan 2 desimal.
- Nilai pada header/kartu KPI harus sama dengan nilai waterfall dan export.

## Rekonsiliasi Wajib
- Per periode:
  - `Gross Profit` di kartu KPI harus sama dengan hasil `Net Sales - HPP Net`.
  - Jumlah di export harus identik dengan angka layar pada periode dan filter yang sama.
- Jika ada selisih, laporan tidak boleh dirilis sebagai dokumen resmi sebelum investigasi selesai.
