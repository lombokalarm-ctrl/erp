# UAT UOM V2 Post-Deploy (12 Skenario)

Dokumen ini berisi langkah UAT terstruktur untuk validasi UOM V2 pada alur:

- Master produk + mapping UOM
- Sales Order -> Delivery -> Invoice
- Sales Return parsial -> Credit Note
- Validasi guard over-return

## Prasyarat

- API production/staging sudah aktif.
- Akun user dengan permission yang cukup untuk:
  - products:read/write
  - customers:read/write
  - sales_orders:read/write
  - invoices:read
  - inventory:write
- `jq` tersedia di VPS.
- Opsional: akses `psql` untuk verifikasi basis data.

## File Script Eksekusi

Gunakan script:

- `scripts/uat/uom-v2-uat.sh`

## Cara Menjalankan

```bash
chmod +x scripts/uat/uom-v2-uat.sh

export BASE_URL="http://127.0.0.1:3000/api/v1"
export ADMIN_EMAIL="admin@yourdomain.com"
export ADMIN_PASSWORD="your_password"

# Opsional verifikasi SQL:
# export PSQL_DSN="postgresql://user:pass@127.0.0.1:5432/erp"

bash scripts/uat/uom-v2-uat.sh
```

## Daftar Skenario Yang Dijalankan Script

1. Login dan ambil token.
2. Buat produk UAT.
3. Set mapping UOM produk (`pcs=1`, `pack=10`, `dus=100`).
4. Uji mapping invalid (faktor 0) harus ditolak.
5. Buat customer UAT.
6. Set credit profile customer.
7. Buat SO `1 pack @ 15.000`.
8. Deliver SO dan auto-generate invoice.
9. Verifikasi invoice terbentuk.
10. Buat + post retur parsial `5 pcs` dari invoice.
11. Verifikasi CN pertama harus `7.500`.
12. Uji over-return `6 pcs` harus gagal saat post.

Tambahan validasi:

- Retur kedua valid `5 pcs` -> CN kedua `7.500`.
- Opsional query SQL untuk cek `qty_base` dan agregat retur.

## Kriteria Lulus

- Semua langkah sukses tanpa error runtime.
- CN parsial pertama bernilai `7.500` (bukan `15.000`, bukan `75.000`).
- Over-return tertolak.
- Jika SQL check diaktifkan: `invoice.qty_base = 10` dan total retur posted = `10`.

## Tindakan Jika Gagal

- Hentikan uji transaksi lanjutan.
- Ambil log aplikasi (`pm2 logs --lines 300`).
- Catat skenario mana yang gagal.
- Rollback sesuai runbook backup/restore yang sudah disiapkan.
