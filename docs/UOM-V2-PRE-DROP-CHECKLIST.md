# UOM V2 Pre-Drop Checklist (Legacy Columns)

Checklist ini dipakai sebelum mengeksekusi cleanup legacy kolom produk:

- `products.pack_size`
- `products.dus_size`
- `products.pack_per_dus`

## 1) Gate Operasional

- UAT outbound dan inbound lulus.
- Tidak ada error konversi UOM pada log produksi.
- Tim menyetujui maintenance window untuk cleanup.
- Backup DB terbaru tersedia dan sudah diverifikasi.

## 2) Gate Data Integritas

```sql
-- Semua produk harus punya base_uom_id.
select count(*) as missing_base_uom
from products
where base_uom_id is null;

-- Semua produk harus punya mapping UOM valid.
select count(*) as invalid_mapping_products
from uom_product_mapping_audit
where base_mapping_count <> 1
   or base_uom_matches_mapping is not true;

-- Kolom basis transaksi tidak boleh null.
select
  (select count(*) from sales_order_items where qty_base is null) +
  (select count(*) from invoice_items where qty_base is null) +
  (select count(*) from delivery_order_items where qty_base is null) +
  (select count(*) from return_items where qty_base is null) +
  (select count(*) from goods_receipt_items where qty_base is null) +
  (select count(*) from purchase_order_items where qty_base is null) as qty_base_null_count;

select
  (select count(*) from sales_order_items where base_uom_id is null) +
  (select count(*) from invoice_items where base_uom_id is null) +
  (select count(*) from delivery_order_items where base_uom_id is null) +
  (select count(*) from return_items where base_uom_id is null) +
  (select count(*) from goods_receipt_items where base_uom_id is null) +
  (select count(*) from purchase_order_items where base_uom_id is null) as base_uom_id_null_count;
```

Semua hasil query di atas harus bernilai `0`.

## 3) Eksekusi Cleanup

`026_deprecate_legacy_uom_columns.sql` bersifat guarded/no-op secara default.

Untuk eksekusi drop kolom di sesi manual:

```sql
set app.uom_v2_cleanup = 'on';
\i migrations/026_deprecate_legacy_uom_columns.sql
```

## 4) Verifikasi Pasca-Drop

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('pack_size', 'dus_size', 'pack_per_dus');
```

Query harus mengembalikan 0 baris.
