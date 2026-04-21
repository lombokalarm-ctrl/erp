import { getRawDb } from './pool.js'

export async function withTransaction<T>(fn: (client: any) => Promise<T>) {
  const db = getRawDb()
  return await db.transaction(async (tx) => {
    const client = {
      query: async (text: string, params?: any[]) => {
        const res = await tx.query(text, params)
        return { ...res, rowCount: res.affectedRows || res.rows.length }
      },
      release: () => {}
    }
    return await fn(client)
  })
}

