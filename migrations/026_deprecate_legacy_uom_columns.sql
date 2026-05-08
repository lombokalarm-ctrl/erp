-- UOM V2 legacy cleanup (guarded, optional).
-- Default behavior: NO-OP (tidak drop kolom).
-- Untuk mengeksekusi drop, jalankan dengan:
--   SET app.uom_v2_cleanup = 'on';
-- lalu eksekusi blok ini secara manual di sesi yang sama.

do $$
declare
  cleanup_enabled text;
  missing_base_count int;
  invalid_mapping_count int;
  null_qty_base_count int;
  null_base_uom_count int;
  has_pack_size boolean;
  has_dus_size boolean;
  has_pack_per_dus boolean;
begin
  cleanup_enabled := coalesce(current_setting('app.uom_v2_cleanup', true), 'off');
  if lower(cleanup_enabled) <> 'on' then
    raise notice 'Skip cleanup legacy UOM columns. Set app.uom_v2_cleanup=on untuk mengeksekusi drop.';
    return;
  end if;

  -- Guard 1: semua produk harus memiliki base_uom_id.
  select count(*)::int
  into missing_base_count
  from products p
  where p.base_uom_id is null;
  if missing_base_count > 0 then
    raise exception 'Cleanup dibatalkan: % produk belum memiliki base_uom_id', missing_base_count
      using errcode = '23514';
  end if;

  -- Guard 2: mapping product_uoms harus valid (tepat 1 base mapping per produk).
  select count(*)::int
  into invalid_mapping_count
  from uom_product_mapping_audit a
  where a.base_mapping_count <> 1
     or a.base_uom_matches_mapping is not true;
  if invalid_mapping_count > 0 then
    raise exception 'Cleanup dibatalkan: % produk memiliki mapping UOM tidak valid', invalid_mapping_count
      using errcode = '23514';
  end if;

  -- Guard 3: transaksi baru wajib sudah konsisten di kolom basis.
  select
    (
      select count(*)::int from sales_order_items where qty_base is null
    ) + (
      select count(*)::int from invoice_items where qty_base is null
    ) + (
      select count(*)::int from delivery_order_items where qty_base is null
    ) + (
      select count(*)::int from return_items where qty_base is null
    ) + (
      select count(*)::int from goods_receipt_items where qty_base is null
    ) + (
      select count(*)::int from purchase_order_items where qty_base is null
    )
  into null_qty_base_count;
  if null_qty_base_count > 0 then
    raise exception 'Cleanup dibatalkan: masih ada % baris transaksi dengan qty_base null', null_qty_base_count
      using errcode = '23514';
  end if;

  select
    (
      select count(*)::int from sales_order_items where base_uom_id is null
    ) + (
      select count(*)::int from invoice_items where base_uom_id is null
    ) + (
      select count(*)::int from delivery_order_items where base_uom_id is null
    ) + (
      select count(*)::int from return_items where base_uom_id is null
    ) + (
      select count(*)::int from goods_receipt_items where base_uom_id is null
    ) + (
      select count(*)::int from purchase_order_items where base_uom_id is null
    )
  into null_base_uom_count;
  if null_base_uom_count > 0 then
    raise exception 'Cleanup dibatalkan: masih ada % baris transaksi dengan base_uom_id null', null_base_uom_count
      using errcode = '23514';
  end if;

  -- Drop kolom legacy produk jika masih ada.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'pack_size'
  ) into has_pack_size;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'dus_size'
  ) into has_dus_size;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'pack_per_dus'
  ) into has_pack_per_dus;

  if has_pack_size then
    execute 'alter table products drop column pack_size';
  end if;
  if has_dus_size then
    execute 'alter table products drop column dus_size';
  end if;
  if has_pack_per_dus then
    execute 'alter table products drop column pack_per_dus';
  end if;

  raise notice 'Legacy UOM columns cleanup selesai.';
end;
$$;
