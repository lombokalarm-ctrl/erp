create or replace function enforce_product_uoms_base_presence()
returns trigger
language plpgsql
as $$
declare
  v_product_id uuid;
  v_product_exists boolean;
  v_base_count int;
begin
  v_product_id := coalesce(new.product_id, old.product_id);
  if v_product_id is null then
    return null;
  end if;

  select exists(select 1 from products p where p.id = v_product_id)
  into v_product_exists;

  if not v_product_exists then
    return null;
  end if;

  select count(*)::int
  into v_base_count
  from product_uoms pu
  where pu.product_id = v_product_id
    and pu.to_base_factor = 1;

  if v_base_count <> 1 then
    raise exception 'Produk % wajib memiliki tepat 1 unit base (to_base_factor=1)', v_product_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;
