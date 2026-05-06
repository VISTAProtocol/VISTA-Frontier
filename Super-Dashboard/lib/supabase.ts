import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)

let browserClient: SupabaseClient | null = null

export function createServerSupabaseClient() {
  if (!hasSupabaseEnv || !supabaseUrl || !supabaseAnonKey) {
    return null
  }

  // Prefer service role key on server to bypass RLS; fall back to anon key if not set
  const key = supabaseServiceRoleKey ?? supabaseAnonKey

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function getBrowserSupabaseClient() {
  if (typeof window === "undefined" || !hasSupabaseEnv || !supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return browserClient
}
