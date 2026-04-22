import { Pool } from 'pg'
import { mustGetEnv } from '../lib/env.js'

let pool: Pool | undefined

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: mustGetEnv('DATABASE_URL'),
    })
  }
  return pool
}
