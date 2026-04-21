export function mustGetEnv(key: string): string {
  const v = process.env[key]
  if (!v) {
    throw new Error(`Missing env: ${key}`)
  }
  return v
}

export function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

