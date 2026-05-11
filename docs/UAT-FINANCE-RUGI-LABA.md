# UAT Finance - Laporan Rugi Laba

## Tujuan
- Memastikan angka rugi laba valid, konsisten, dan siap dipakai sebagai dokumen resmi.

## Prasyarat
- Data transaksi periode uji sudah ada (invoice + payment + retur penjualan).
- Produk uji minimal memiliki skenario multi-satuan (`dus/pack/pcs` atau setara).
- User memiliki akses `reports:read`.

## Skenario UAT

1. Buka halaman `Laporan Rugi Laba`, pilih periode, klik `Filter`.
- Ekspektasi: data tampil tanpa error.

2. Verifikasi formula utama di layar.
- Hitung manual: `Net Sales = Gross Sales - Diskon - Retur`.
- Ekspektasi: sama dengan angka kartu `Penjualan Bersih`.

3. Verifikasi formula HPP.
- Hitung manual: `HPP Net = HPP Sales - HPP Retur`.
- Ekspektasi: sama dengan angka kartu `HPP Net`.

4. Verifikasi gross profit.
- Hitung manual: `Gross Profit = Net Sales - HPP Net`.
- Ekspektasi: sama dengan kartu `Laba Kotor`.

5. Verifikasi margin.
- Hitung manual: `Margin (%) = Gross Profit / Net Sales * 100`.
- Ekspektasi: sama dengan margin di kartu.

6. Verifikasi tabel `Laba Kotor per Kategori`.
- Ekspektasi: total per kategori logis terhadap ringkasan periode.

7. Verifikasi tabel `Top Kontributor SKU`.
- Ekspektasi: kolom `Net Sales`, `HPP Net`, `Gross Profit` konsisten tanda positif/negatif.

8. Uji kasus retur parsial.
- Ekspektasi: `Retur (Net)` bertambah, `Net Sales` turun, `HPP Net` ikut turun, `Gross Profit` berubah proporsional.

9. Export Excel analitik.
- Ekspektasi: workbook berisi sheet `Waterfall`, `Per Kategori`, `Top SKU`.
- Ekspektasi: angka di sheet sama dengan angka di layar pada filter yang sama.

10. Export PDF analitik.
- Ekspektasi: section `Waterfall`, `Per Kategori`, `Top SKU` tampil lengkap.
- Ekspektasi: pembulatan 2 desimal konsisten.

## Kriteria Lulus
- Semua formula utama valid.
- Tidak ada selisih angka antara layar dan export.
- Tidak ada nilai `undefined`, `NaN`, atau angka panjang tidak wajar.
