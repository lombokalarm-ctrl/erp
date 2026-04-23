import { getPool } from '../db/pool.js'

export async function listRegions() {
  const pool = getPool()
  const res = await pool.query(`select id, name from regions order by name asc`)
  return res.rows
}

export async function createRegion(name: string) {
  const pool = getPool()
  const res = await pool.query(
    `insert into regions (name) values ($1) returning id, name`,
    [name]
  )
  return res.rows[0]
}
