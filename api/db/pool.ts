import { PGlite } from '@electric-sql/pglite'

let db: PGlite | undefined

export function getPool() {
  if (!db) {
    db = new PGlite('data') // persistent in memory/fs
  }
  
  const pool = {
    query: async (text: string, params?: any[]) => {
      const res = await db!.query(text, params)
      return { ...res, rowCount: res.affectedRows || res.rows.length }
    },
    connect: async () => {
      // Just returning a dummy client, since we handle tx differently
      return {
        query: async (text: string, params?: any[]) => {
          const res = await db!.query(text, params)
          return { ...res, rowCount: res.affectedRows || res.rows.length }
        },
        release: () => {}
      }
    }
  }
  
  return pool as any
}

export function getRawDb() {
  if (!db) {
    db = new PGlite('data')
  }
  return db
}

