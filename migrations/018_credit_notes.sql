alter table returns
  add column if not exists source_invoice_id uuid references invoices(id),
  add column if not exists credit_note_id uuid,
  add column if not exists financial_status text not null default 'NONE';

update returns
set status = 'POSTED'
where status = 'COMPLETED';

alter table returns
  drop constraint if exists returns_status_check;

alter table returns
  add constraint returns_status_check
  check (status in ('DRAFT', 'POSTED', 'CANCELLED', 'COMPLETED'));

alter table returns
  drop constraint if exists returns_financial_status_check;

alter table returns
  add constraint returns_financial_status_check
  check (financial_status in ('NONE', 'CREDIT_NOTE_POSTED'));

create table if not exists credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_no text not null unique,
  customer_id uuid not null references customers(id),
  return_id uuid unique references returns(id) on delete set null,
  sales_order_id uuid references sales_orders(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  credit_date date not null,
  reason text,
  subtotal_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  applied_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  status text not null default 'POSTED',
  notes text,
  created_by uuid not null references users(id),
  posted_by uuid references users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table credit_notes
  drop constraint if exists credit_notes_status_check;

alter table credit_notes
  add constraint credit_notes_status_check
  check (status in ('DRAFT', 'POSTED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED', 'CANCELLED'));

alter table credit_notes
  drop constraint if exists credit_notes_amount_non_negative_check;

alter table credit_notes
  add constraint credit_notes_amount_non_negative_check
  check (
    subtotal_amount >= 0
    and discount_amount >= 0
    and tax_amount >= 0
    and total_amount >= 0
    and applied_amount >= 0
    and remaining_amount >= 0
    and applied_amount <= total_amount
  );

create table if not exists credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  product_id uuid not null references products(id),
  source_invoice_item_id uuid references invoice_items(id) on delete set null,
  source_return_item_id uuid references return_items(id) on delete set null,
  qty numeric(14,2) not null,
  uom text not null default 'pcs',
  uom_to_pcs int not null default 1,
  qty_pcs int not null default 0,
  unit_price numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  reason text
);

alter table credit_note_items
  drop constraint if exists credit_note_items_amount_non_negative_check;

alter table credit_note_items
  add constraint credit_note_items_amount_non_negative_check
  check (
    qty >= 0
    and uom_to_pcs >= 1
    and qty_pcs >= 0
    and unit_price >= 0
    and discount_amount >= 0
    and line_total >= 0
  );

create table if not exists credit_note_applies (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  apply_date timestamptz not null default now(),
  amount numeric(14,2) not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

alter table credit_note_applies
  drop constraint if exists credit_note_applies_amount_positive_check;

alter table credit_note_applies
  add constraint credit_note_applies_amount_positive_check
  check (amount > 0);

create index if not exists returns_source_invoice_id_idx on returns(source_invoice_id);
create index if not exists credit_notes_customer_id_idx on credit_notes(customer_id);
create index if not exists credit_notes_invoice_id_idx on credit_notes(invoice_id);
create index if not exists credit_notes_return_id_idx on credit_notes(return_id);
create index if not exists credit_note_items_credit_note_id_idx on credit_note_items(credit_note_id);
create index if not exists credit_note_applies_credit_note_id_idx on credit_note_applies(credit_note_id);
create index if not exists credit_note_applies_invoice_id_idx on credit_note_applies(invoice_id);
