import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { getPool } from '../db/pool.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  const pool = getPool()
  const client = await pool.connect()
  await client.query(
    `
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `,
  )

  const migrationsDir = path.resolve(__dirname, '../../migrations')
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const filename of files) {
    const already = await client.query(
      'select 1 from schema_migrations where filename = $1 limit 1',
      [filename],
    )
    if (already.rowCount) {
      console.log(`Skipping ${filename}`)
      continue
    }

    console.log(`Running ${filename}`)
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into schema_migrations(filename) values ($1)', [
        filename,
      ])
      await client.query('commit')
      console.log(`Success ${filename}`)
    } catch (err) {
      await client.query('rollback')
      console.error(`Failed ${filename}`, err)
      throw err
    }
  }

  client.release()
  if (pool.end) await pool.end()
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(String(err))
  process.exit(1)
})
