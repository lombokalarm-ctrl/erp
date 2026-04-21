import { getPool } from '../db/pool.js'

export async function listWarehouses() {
  const pool = getPool()
  const res = await pool.query(`select id, code, name from warehouses order by code asc`)
  return res.rows as { id: string; code: string; name: string }[]
}

