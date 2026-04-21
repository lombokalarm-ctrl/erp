import { getPool } from '../db/pool.js'

export async function createFileRecord(input: {
  originalName: string
  mimeType: string
  sizeBytes: number
  storagePath: string
}) {
  const pool = getPool()
  const res = await pool.query(
    `
      insert into files(original_name, mime_type, size_bytes, storage_path)
      values ($1,$2,$3,$4)
      returning id
    `,
    [input.originalName, input.mimeType, input.sizeBytes, input.storagePath],
  )
  return String(res.rows[0].id)
}

