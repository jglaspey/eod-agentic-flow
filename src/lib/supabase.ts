import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

// Create a single instance for server-side operations
let _supabase: SupabaseClient | null = null

export function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createSupabaseClient()
  }
  return _supabase
}

export const supabase = createSupabaseClient()