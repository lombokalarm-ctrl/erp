alter table purchase_invoices
  add column if not exists supplier_invoice_no text;

create unique index if not exists purchase_invoices_supplier_invoice_unique
  on purchase_invoices (supplier_id, supplier_invoice_no)
  where supplier_invoice_no is not null and supplier_invoice_no <> '';

