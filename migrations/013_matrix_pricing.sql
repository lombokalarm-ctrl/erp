-- Migrasi struktur category_prices dari number flat ke object {pcs, pack, dus}
UPDATE products
SET category_prices = (
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      CASE 
        WHEN jsonb_typeof(value) = 'number' THEN jsonb_build_object('pcs', value::numeric, 'pack', 0, 'dus', 0)
        ELSE value
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(category_prices)
)
WHERE category_prices != '{}'::jsonb;
