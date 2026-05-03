import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client - bypasses RLS.
 * Only use server-side for operations that are architecturally impossible
 * with the anon key due to RLS bootstrap constraints (e.g. inserting the
 * first owner membership when no membership yet exists to satisfy the policy).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
