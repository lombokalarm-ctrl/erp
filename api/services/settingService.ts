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

function getDefaultCompanySettings(): CompanySettings {
  return {
    name: 'Nama Perusahaan',
    address: '',
    phone: '',
    email: '',
    taxNumber: '',
    website: '',
  }
}

export async function getCompanySettings() {
  try {
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
      return getDefaultCompanySettings()
    }

    return res.rows[0] as CompanySettings
  } catch (err: any) {
    // Allow the app to boot even when local DB/env setup is incomplete.
    if (err?.code === '42P01' || String(err?.message ?? '').includes('Missing env: DATABASE_URL')) {
      return getDefaultCompanySettings()
    }
    throw err
  }
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
