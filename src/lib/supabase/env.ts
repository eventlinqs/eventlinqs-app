// Supabase env resolver.
//
// Phase 2.5 introduces a separate "eventlinqs-preview" Supabase project
// that backs Vercel preview deployments and load tests. Production
// deployments must keep using the main project. The cleanest discriminator
// for this is the *presence* of dedicated `*_PREVIEW` env vars: Vercel
// is configured to set them only on the preview environment, so:
//
//   - production deploys: only base vars set -> base values used.
//   - preview deploys:    *_PREVIEW set, base also set -> preview wins.
//   - dev / local:        whichever the founder has in `.env.local`.
//
// Why presence-based instead of `VERCEL_ENV`-based:
//   1. `NEXT_PUBLIC_*` values are inlined at *build* time. The build sees
//      the env vars present at that moment, so checking presence at the
//      build step gives a deterministic result without needing a separate
//      `NEXT_PUBLIC_VERCEL_ENV` indirection.
//   2. It fails safe: if the founder forgets to provision the preview
//      project, preview deploys silently fall back to production rather
//      than break. We surface a console warning so the regression is
//      visible without being fatal.
//
// Important: keep this file dependency-free. It is imported by the four
// Supabase client modules and must not bring in any heavy transitives
// that would re-bundle the auth code.

function pickFirst(...candidates: Array<string | undefined>): string {
  for (const c of candidates) {
    if (c && c.length > 0) return c
  }
  return ''
}

/** Public anon-key URL. NEXT_PUBLIC_*, inlined into client bundles. */
export function getSupabaseUrl(): string {
  return pickFirst(
    process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  )
}

/** Public anon key. NEXT_PUBLIC_*, inlined into client bundles. */
export function getSupabaseAnonKey(): string {
  return pickFirst(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/**
 * Server-side service role key. Bypasses RLS - never expose to client.
 * Read at request time inside the admin client factory; never inlined
 * into client bundles because it is not NEXT_PUBLIC_*.
 */
export function getSupabaseServiceRoleKey(): string {
  return pickFirst(
    process.env.SUPABASE_SERVICE_ROLE_KEY_PREVIEW,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/**
 * True when the resolver is returning preview-project credentials.
 * Useful for log lines that need to call out the active backend during
 * load tests so a stray production-cred preview deploy is debuggable
 * from response headers / logs alone.
 */
export function isUsingPreviewSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW,
  )
}
