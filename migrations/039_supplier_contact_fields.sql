alter table suppliers
  add column if not exists contact_person text,
  add column if not exists email text;
