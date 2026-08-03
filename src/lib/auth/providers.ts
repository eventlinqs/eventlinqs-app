import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'

/**
 * ENABLED-PROVIDER RESOLVER.
 *
 * The defect this exists to make impossible: on 2026-08-02 production rendered
 * a "Continue with Google" button while `google` was disabled on the production
 * Supabase project. Clicking it navigated the browser to
 * `{SUPABASE_URL}/auth/v1/authorize`, which answered
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * as raw JSON in the user's tab. No application error boundary can catch that:
 * `supabase.auth.signInWithOAuth()` resolves with `error: null` and then hands
 * the tab to a third-party origin, so the failure happens somewhere we no
 * longer control. The only permanent fix is to never render the button unless
 * the provider is genuinely enabled, which is what this module decides.
 *
 * The source of truth is GoTrue's own public settings document,
 * `GET {SUPABASE_URL}/auth/v1/settings`, which reports the live dashboard state
 * of every provider. It needs only the anon key, is cheap, and cannot drift
 * from what the authorize endpoint will do, because it is the same server
 * reporting on itself.
 *
 * FAIL SAFE, ALWAYS. Any failure - network, non-200, malformed body, missing
 * env - resolves to "nothing is enabled". Hiding a working button costs a user
 * one extra click on email sign-in. Showing a broken one costs them the JSON
 * page. The asymmetry decides the default.
 */

/**
 * The registry of providers this application is capable of rendering a button
 * for. `scripts/guards/auth-provider-guard.mjs` cross-checks this list against
 * the components that actually exist, so a new provider button cannot be added
 * without also being gated here.
 */
export const RENDERABLE_PROVIDERS = ['google'] as const

export type RenderableProvider = (typeof RENDERABLE_PROVIDERS)[number]

export type EnabledProviders = Record<RenderableProvider, boolean>

/** Every provider off. The fail-safe answer and the shape callers destructure. */
const NONE_ENABLED: EnabledProviders = Object.freeze(
  Object.fromEntries(RENDERABLE_PROVIDERS.map((p) => [p, false])) as EnabledProviders,
)

/**
 * Cache TTL. Enabling a provider is a deliberate one-off dashboard action, so
 * five minutes of staleness is irrelevant to correctness and removes the fetch
 * from effectively every page render. The cost is measured in
 * `scripts/verify/auth-provider-cache-cost.mjs`.
 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Hard ceiling on the settings fetch so a slow Supabase cannot slow a render. */
const FETCH_TIMEOUT_MS = 3000

type CacheEntry = { value: EnabledProviders; expiresAt: number }

/**
 * Per-instance memo. Deliberately a plain module-scope value rather than
 * `unstable_cache`: this must work identically inside a cron route, a route
 * handler and a React Server Component, and it must never be captured into a
 * static prerender. A warm serverless instance serves many requests, so a
 * module memo removes the fetch from the overwhelming majority of them.
 */
let cache: CacheEntry | null = null

/** In-flight de-duplication: a cold instance under load fetches once, not N times. */
let inFlight: Promise<EnabledProviders> | null = null

/** Test seam. Clears the memo so a test can drive a fresh resolution. */
export function __resetProviderCache(): void {
  cache = null
  inFlight = null
}

/** Shape the GoTrue settings body into our registry, defaulting to false. */
export function parseSettingsBody(body: unknown): EnabledProviders {
  const external = (body as { external?: Record<string, unknown> } | null)?.external
  if (!external || typeof external !== 'object') return { ...NONE_ENABLED }
  return Object.fromEntries(
    RENDERABLE_PROVIDERS.map((p) => [p, external[p] === true]),
  ) as EnabledProviders
}

async function fetchEnabledProviders(): Promise<EnabledProviders> {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) return { ...NONE_ENABLED }

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Never let the Next data cache hold this: the module memo above is the
      // cache, and it is the one with the TTL we reason about.
      cache: 'no-store',
    })
    if (!res.ok) return { ...NONE_ENABLED }
    return parseSettingsBody(await res.json())
  } catch {
    return { ...NONE_ENABLED }
  }
}

/**
 * Which OAuth providers may be rendered right now. Server-side only: the anon
 * key is public, but doing this in the browser would put a network round trip
 * in front of the button and re-open a window where the button renders before
 * the answer arrives.
 */
export async function getEnabledProviders(): Promise<EnabledProviders> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value
  if (inFlight) return inFlight

  inFlight = fetchEnabledProviders()
    .then((value) => {
      // Only a successful resolution is cached for the full TTL. A fail-safe
      // all-false answer is cached briefly so a Supabase blip does not turn
      // into five minutes of hidden buttons.
      const anyEnabled = Object.values(value).some(Boolean)
      cache = { value, expiresAt: Date.now() + (anyEnabled ? CACHE_TTL_MS : 30_000) }
      return value
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Convenience for the common single-provider question. */
export async function isProviderEnabled(provider: RenderableProvider): Promise<boolean> {
  return (await getEnabledProviders())[provider]
}
