create table if not exists company_settings (
  id int primary key default 1,
  name text not null default 'Nama Perusahaan',
  address text,
  phone text,
  email text,
  tax_number text, -- NPWP
  website text,
  updated_at timestamptz not null default now(),
  constraint company_settings_single_row check (id = 1)
);

insert into company_settings (id, name, address, phone, email, tax_number, website) 
values (1, 'PT Distributor Sukses', 'Jl. Jendral Sudirman No. 123, Jakarta', '021-5551234', 'info@distributorsukses.com', '01.234.567.8-901.000', 'www.distributorsukses.com')
on conflict (id) do nothing;
