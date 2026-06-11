import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function createClient() {
  const cookieStore = await cookies()
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and publishable/anon key")
  }
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Puede ocurrir en un Server Component; el middleware mantiene la sesión.
        }
      },
    },
  })
}
