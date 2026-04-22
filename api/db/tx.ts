import { getPool } from './pool.js'

export async function withTransaction<T>(fn: (client: any) => Promise<T>) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
