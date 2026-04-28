alter table products add column pack_per_dus int not null default 1;

update products
set pack_per_dus =
  case
    when pack_size > 0 and dus_size > 0 and (dus_size % pack_size) = 0 then (dus_size / pack_size)
    else 1
  end
where pack_per_dus = 1;

update products
set dus_size = pack_size * pack_per_dus
where pack_size > 0 and pack_per_dus > 0 and dus_size <> pack_size * pack_per_dus;
