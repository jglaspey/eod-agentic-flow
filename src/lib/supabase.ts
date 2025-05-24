import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _supabaseInstance: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is not defined. Check environment variables.');
  }
  if (!_supabaseInstance) {
    console.log('Creating new Supabase client instance');
    _supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      // Add a custom fetch to potentially debug or control retries if needed later
      // global: { fetch: customFetch } 
    });
  }
  return _supabaseInstance;
}

// No longer exporting a pre-initialized client
// export const supabase = createSupabaseClient()