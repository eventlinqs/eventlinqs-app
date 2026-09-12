import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'
import { undedupedFetch } from './undeduped-fetch'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component - ignore
          }
        },
      },
      // Every request carries its own signal, so a retry inside a render is a
      // real second request and not the framework's memo of the first failure
      // (src/lib/supabase/undeduped-fetch.ts).
      global: { fetch: undedupedFetch },
    }
  )
}
