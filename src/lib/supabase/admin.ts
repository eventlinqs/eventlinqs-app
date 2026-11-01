import { createClient } from '@supabase/supabase-js'
import { previewReadOnlyOn } from '@/lib/preview/read-only-flag'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'
import { undedupedFetch } from './undeduped-fetch'

/**
 * Service-role client - bypasses RLS.
 * Only use server-side for operations that are architecturally impossible
 * with the anon key due to RLS bootstrap constraints (e.g. inserting the
 * first owner membership when no membership yet exists to satisfy the policy).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  // THE READ-ONLY PREVIEW NEVER USES A SERVICE KEY (the CONTROLLER's ruling of 1 November 2026, 11:42 (2); 2 November:
  // that preview reads production by URL and anon key while its scope still carries TEST's service key, so every admin
  // read sent TEST's key to production and was refused, and organiser profiles answered 500). Under PREVIEW_READ_ONLY=1
  // this client is made with the anon key: production's own row policies decide every read. The build side is
  // scripts/lib/preview-read-only-build.mjs. Unset, nothing changes.
  const key = previewReadOnlyOn() ? getSupabaseAnonKey() : getSupabaseServiceRoleKey()
  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Every request carries its own signal, so a retry inside a render is a
    // real second request and not the framework's memo of the first failure
    // (src/lib/supabase/undeduped-fetch.ts).
    global: { fetch: undedupedFetch },
  })
}
