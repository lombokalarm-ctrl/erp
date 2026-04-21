import { getPool } from '../db/pool.js'
import { ApiError } from '../lib/http.js'

export type CompanySettings = {
  name: string
  address: string
  phone: string
  email: string
  taxNumber: string
  website: string
}

export async function getCompanySettings() {
  const pool = getPool()
  const res = await pool.query(
    `
      select 
        name, 
        address, 
        phone, 
        email, 
        tax_number as "taxNumber", 
        website 
      from company_settings 
      where id = 1
    `
  )
  
  if (!res.rows[0]) {
    // Fallback if not initialized
    return {
      name: 'Nama Perusahaan',
      address: '',
      phone: '',
      email: '',
      taxNumber: '',
      website: ''
    }
  }

  return res.rows[0] as CompanySettings
}

export async function updateCompanySettings(input: CompanySettings) {
  const pool = getPool()
  
  const res = await pool.query(
    `
      insert into company_settings (id, name, address, phone, email, tax_number, website)
      values (1, $1, $2, $3, $4, $5, $6)
      on conflict (id) do update set
        name = excluded.name,
        address = excluded.address,
        phone = excluded.phone,
        email = excluded.email,
        tax_number = excluded.tax_number,
        website = excluded.website,
        updated_at = now()
      returning 
        name, 
        address, 
        phone, 
        email, 
        tax_number as "taxNumber", 
        website
    `,
    [
      input.name,
      input.address ?? '',
      input.phone ?? '',
      input.email ?? '',
      input.taxNumber ?? '',
      input.website ?? ''
    ]
  )

  return res.rows[0] as CompanySettings
}
