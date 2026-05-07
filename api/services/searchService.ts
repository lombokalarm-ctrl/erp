import { getPool } from '../db/pool.js'

export const SEARCH_MODULES = [
  'customers',
  'products',
  'suppliers',
  'sales-orders',
  'invoices',
  'credit-notes',
] as const

export type SearchModule = (typeof SEARCH_MODULES)[number]

export type SearchItem = {
  id: string
  module: SearchModule
  title: string
  subtitle: string
  status?: string
  url: string
}

export async function globalSearch(params: {
  q: string
  limitPerModule: number
  modules: SearchModule[]
}) {
  const q = `%${params.q.trim().toLowerCase()}%`
  const tasks = params.modules.map((module) => searchByModule(module, q, params.limitPerModule))
  const parts = await Promise.all(tasks)
  return parts.flat()
}

async function searchByModule(module: SearchModule, q: string, limit: number) {
  switch (module) {
    case 'customers':
      return searchCustomers(q, limit)
    case 'products':
      return searchProducts(q, limit)
    case 'suppliers':
      return searchSuppliers(q, limit)
    case 'sales-orders':
      return searchSalesOrders(q, limit)
    case 'invoices':
      return searchInvoices(q, limit)
    case 'credit-notes':
      return searchCreditNotes(q, limit)
    default:
      return []
  }
}

async function searchCustomers(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select id, code, name, status
      from customers
      where lower(code) like $1
         or lower(name) like $1
      order by updated_at desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'customers',
    title: `${r.code} - ${r.name}`,
    subtitle: 'Pelanggan',
    status: String(r.status ?? ''),
    url: '/customers',
  }))
}

async function searchProducts(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select id, sku, name
      from products
      where lower(sku) like $1
         or lower(name) like $1
      order by updated_at desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'products',
    title: `${r.sku} - ${r.name}`,
    subtitle: 'Produk',
    url: '/products',
  }))
}

async function searchSuppliers(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select id, code, name
      from suppliers
      where lower(code) like $1
         or lower(name) like $1
      order by updated_at desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'suppliers',
    title: `${r.code} - ${r.name}`,
    subtitle: 'Supplier',
    url: '/suppliers',
  }))
}

async function searchSalesOrders(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        so.id,
        so.order_no,
        so.status,
        c.name as customer_name
      from sales_orders so
      join customers c on c.id = so.customer_id
      where lower(so.order_no) like $1
         or lower(c.name) like $1
      order by so.order_date desc, so.order_no desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'sales-orders',
    title: `${r.order_no} - ${r.customer_name}`,
    subtitle: 'Sales Order',
    status: String(r.status ?? ''),
    url: '/sales-orders',
  }))
}

async function searchInvoices(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        i.id,
        i.invoice_no,
        i.status,
        c.name as customer_name
      from invoices i
      join customers c on c.id = i.customer_id
      where lower(i.invoice_no) like $1
         or lower(c.name) like $1
      order by i.invoice_date desc, i.invoice_no desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'invoices',
    title: `${r.invoice_no} - ${r.customer_name}`,
    subtitle: 'Invoice',
    status: String(r.status ?? ''),
    url: `/invoices/${r.id}`,
  }))
}

async function searchCreditNotes(q: string, limit: number): Promise<SearchItem[]> {
  const pool = getPool()
  const res = await pool.query(
    `
      select
        cn.id,
        cn.credit_no,
        cn.status,
        c.name as customer_name
      from credit_notes cn
      join customers c on c.id = cn.customer_id
      where lower(cn.credit_no) like $1
         or lower(c.name) like $1
      order by cn.credit_date desc, cn.credit_no desc
      limit $2
    `,
    [q, limit],
  )
  return res.rows.map((r) => ({
    id: String(r.id),
    module: 'credit-notes',
    title: `${r.credit_no} - ${r.customer_name}`,
    subtitle: 'Note Kredit',
    status: String(r.status ?? ''),
    url: '/credit-notes',
  }))
}
