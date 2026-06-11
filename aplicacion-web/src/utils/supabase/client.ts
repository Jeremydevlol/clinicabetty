import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""

const PLACEHOLDER = {
  url: "https://placeholder.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIn0.placeholder",
}

export function createClient() {
  const url = supabaseUrl || PLACEHOLDER.url
  const key = supabaseKey || PLACEHOLDER.key
  return createBrowserClient(url, key)
}

/** Instancia compartida para el cliente (p. ej. `App.jsx`). */
export const supabase = createClient()
