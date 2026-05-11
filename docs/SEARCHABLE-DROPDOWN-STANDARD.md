# Standar Searchable Dropdown

## Tujuan
- Menyeragamkan dropdown form agar selalu punya kolom pencarian untuk data besar.

## Komponen Standar
- Gunakan `SearchableSelect` dari `src/components/ui/SearchableSelect.tsx`.

## Aturan Penggunaan
- Dropdown dengan opsi banyak wajib pakai `SearchableSelect`.
- Gunakan `searchPlaceholder` yang jelas sesuai domain data.
- Label opsi harus informatif (contoh: `SKU - Nama Produk`, `Kode - Nama`).
- Untuk field wajib pilih, gunakan `includePlaceholder=true` dengan placeholder yang sesuai.
- Untuk field default terpilih, boleh `includePlaceholder=false`.

## Cakupan Refactor Tahap Ini
- `SalesOrders`:
  - Pelanggan
  - Produk pada item SO
- `PurchaseOrders`:
  - Supplier
  - Produk pada item PO
- `GoodsReceipts`:
  - Gudang
  - Produk pada item GRN
- `Returns`:
  - Partner (customer/supplier)
  - Invoice sumber
  - Produk pada item retur
- `Inventory`:
  - Produk pada Stock Adjustment

## Catatan
- Refactor ini hanya mengubah komponen input dropdown, tidak mengubah payload API dan logika bisnis.
