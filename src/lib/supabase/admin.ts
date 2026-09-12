import { createClient } from '@supabase/supabase-js'
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './env'
import { undedupedFetch } from './undeduped-fetch'

/**
 * Service-role client - bypasses RLS.
 * Only use server-side for operations that are architecturally impossible
 * with the anon key due to RLS bootstrap constraints (e.g. inserting the
 * first owner membership when no membership yet exists to satisfy the policy).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    // Every request carries its own signal, so a retry inside a render is a
    // real second request and not the framework's memo of the first failure
    // (src/lib/supabase/undeduped-fetch.ts).
    global: { fetch: undedupedFetch },
  })
}
