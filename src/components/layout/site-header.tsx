import { MELBOURNE_FALLBACK } from '@/lib/geo/detect'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { createClient } from '@/lib/supabase/server'
import { SiteHeaderClient } from './site-header-client'
import { deriveAccountUser, type AccountUser } from './site-header-account-button'

/**
 * SiteHeader - public site top navigation.
 *
 * Server wrapper. Resolves:
 *   - the picker city list (cached)
 *   - the current Supabase auth user (cookie-bound, no DB hit beyond
 *     the standard `auth.getUser()` call which Supabase caches per-request)
 *
 * Hands a minimal `AccountUser` shape (initials + display name) to the
 * client inner so the avatar shell can render without leaking the full
 * Supabase user record into the client bundle. Anonymous visitors get
 * `user={null}` and the client falls back to the Sign In + Get Started
 * pair (Batch 9.1 behaviour, preserved).
 *
 * `auth.getUser()` reads the session cookie. On a page that renders
 * DYNAMICALLY (the default for most surfaces) that is fine. But on a page
 * that is held STATIC / on-demand-ISR (e.g. /events/[slug] and
 * /events/browse/[city], which set `revalidate` and are deliberately
 * cookie-free at the page level so Vercel can edge-cache an anonymous,
 * shared response), reading the session cookie here promotes the render
 * from static to dynamic AT RUNTIME and Next.js throws a hard 500
 * ("Page changed from static to dynamic at runtime, reason: cookies").
 * The try/catch below cannot rescue it - the cookie ACCESS is recorded by
 * the static-generation store even when the thrown bail is caught.
 *
 * Those routes therefore pass `staticSafe`, which skips the server auth
 * read entirely and renders the anonymous header (the same header an
 * unauthenticated visitor, and the build-prerendered homepage, already
 * see). This keeps them ISR-eligible and makes their shared edge-cache
 * entry correct - a per-user header must never be cached and replayed to
 * another visitor. The avatar is intentionally not shown on these
 * anonymous-cacheable surfaces.
 */
export async function SiteHeader({ staticSafe = false }: { staticSafe?: boolean } = {}) {
  const cities = await getPickerCities()

  let user: AccountUser | null = null
  let userEmail: string | null = null
  if (!staticSafe) {
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        user = deriveAccountUser({
          email: data.user.email,
          user_metadata: data.user.user_metadata,
        })
        userEmail = data.user.email ?? null
      }
    } catch {
      // Auth resolution failures (e.g. malformed cookie, network blip on the
      // Supabase auth server) must NOT block the public surface from
      // rendering. Fall back to anonymous.
      user = null
      userEmail = null
    }
  }

  return (
    <SiteHeaderClient
      location={MELBOURNE_FALLBACK}
      cities={cities}
      user={user}
      userEmail={userEmail}
    />
  )
}
