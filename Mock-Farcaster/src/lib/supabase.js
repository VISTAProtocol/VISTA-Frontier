import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

let browserClient = null;

export function getBrowserSupabaseClient() {
  if (typeof window === "undefined" || !hasSupabaseEnv) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return browserClient;
}
