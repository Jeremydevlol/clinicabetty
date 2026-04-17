#!/usr/bin/env node
/**
 * Aplica la columna `auth_user_id` en `public.empleados` si la BD se creó sin ella.
 *
 * En Supabase: Project Settings → Database → Connection string → URI
 * (usá "Session mode" o "Direct"; pegá la URL con la contraseña en .env.local como DATABASE_URL).
 *
 *   npm run db:fix-auth-user-id
 */
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return
  const text = readFileSync(p, 'utf8')
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Definí DATABASE_URL en .env.local (cadena URI de Postgres en Supabase → Database).')
  process.exit(1)
}

const sqlPath = join(root, 'supabase/migrations/20260331150000_fix_empleados_auth_user_id.sql')
const sql = readFileSync(sqlPath, 'utf8')

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query(sql)
  console.log('Listo: columna auth_user_id e índice aplicados. Probá de nuevo «Crear cuenta».')
  console.log('Si PostgREST sigue en error: Supabase → Settings → API → «Reload schema».')
} finally {
  await client.end()
}
