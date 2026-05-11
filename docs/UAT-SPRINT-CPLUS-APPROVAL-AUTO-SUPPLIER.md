# UAT Sprint C+ - Approval Transfer 2-Level & Auto Draft PO by Supplier

## Tujuan
- Memverifikasi alur baru:
- `Approval Transfer Gudang 2-Level` (L1 -> L2 -> posting transfer).
- `Auto Draft PO by Supplier` dari rekomendasi replenishment.

## Prasyarat
- Migrasi `028`, `029`, dan `030` sudah dijalankan.
- `jq` terpasang di server uji.
- Akun uji punya akses minimum:
- `inventory:read`, `inventory:write`
- `inventory:approve_level1`, `inventory:approve_level2`
- `purchasing:read`, `purchasing:write`
- `products:write`, `suppliers:write`

## Jalankan Script UAT
```bash
cd /path/ke/erp
chmod +x scripts/uat/sprint-cplus-approval-auto-supplier-uat.sh

export BASE_URL="http://127.0.0.1:3005/api/v1"
export ADMIN_EMAIL="admin@apli.my.id"
export ADMIN_PASSWORD="adminapli"
export STEP_MODE="true"
export LOG_DIR="./scripts/uat/logs"

bash scripts/uat/sprint-cplus-approval-auto-supplier-uat.sh
```

## Mode Non-Interaktif (Direkomendasikan untuk CI/UAT cepat)
```bash
export STEP_MODE="false"
export LOG_DIR="./scripts/uat/logs"
bash scripts/uat/sprint-cplus-approval-auto-supplier-uat.sh
```

Output akhir akan menampilkan ringkasan:
- `PASS=<jumlah>`
- `INFO=<jumlah>`
- `FAIL=<jumlah>`
- `LOG_FILE=<path log>`

## Skenario yang Diuji Script
1. Login admin.
2. Ambil 2 gudang aktif.
3. Buat 2 supplier uji.
4. Buat produk uji dengan parameter replenishment.
5. Seed histori supplier lewat PO+GRN.
6. Jalankan `autoBySupplier` pada endpoint draft PO replenishment.
7. Ajukan transfer gudang (membuat `request` status `PENDING_L1`).
8. Ambil antrean approval level 1 dan level 2.
9. Approve level 1 (status jadi `PENDING_L2`).
10. Approve level 2 (transfer posted terbentuk).
11. Verifikasi transfer posted muncul di daftar transfer.
12. Uji idempotent `clientRef` (request kedua harus `duplicate=true`).

## Kriteria Lulus
- `Auto Draft PO by Supplier` menghasilkan minimal 1 draft PO.
- Request transfer awal wajib `PENDING_L1`.
- Setelah approve L1, status request jadi `PENDING_L2`.
- Setelah approve L2, status request `APPROVED` dan `postedTransferNo` terbentuk.
- Dokumen transfer muncul di list transfer gudang.
- Submit request dengan `clientRef` yang sama menghasilkan `duplicate=true`.

## Catatan Operasional
- Untuk memisahkan role approver di lapangan:
- L1 diproses user Manager (`inventory:approve_level1`).
- L2 diproses user Admin (`inventory:approve_level2`).
- Script ini menggunakan 1 akun admin agar otomatis end-to-end.
