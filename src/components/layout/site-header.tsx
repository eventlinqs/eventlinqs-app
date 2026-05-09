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
 * `auth.getUser()` reads the session cookie. It does NOT push the route
 * into dynamic SSR by itself; Next.js classifies the call as a normal
 * data fetch. ISR-eligible routes that mount the SiteHeader stay
 * statically generated, with the avatar state hydrating from the cookie
 * post-mount on revalidation.
 */
export async function SiteHeader() {
  const cities = await getPickerCities()

  let user: AccountUser | null = null
  let userEmail: string | null = null
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

  return (
    <SiteHeaderClient
      location={MELBOURNE_FALLBACK}
      cities={cities}
      user={user}
      userEmail={userEmail}
    />
  )
}
