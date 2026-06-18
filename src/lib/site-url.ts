/**
 * Canonical site origin resolver.
 *
 * Single source of truth for the absolute base URL used by metadata
 * (metadataBase), robots.txt, sitemap.xml and any server-side absolute
 * URL construction. The resolution precedence is chosen so that NO
 * deployed environment can fall back to localhost. That fallback is the
 * defect that leaked `http://localhost:3000/opengraph-image` into
 * production Open Graph and Twitter tags across every marketing page.
 *
 *   1. NEXT_PUBLIC_SITE_URL            explicit override (any environment)
 *   2. VERCEL_PROJECT_PRODUCTION_URL   stable production domain (Vercel, build time)
 *   3. VERCEL_URL                      per-deployment URL (correct OG on preview deployments)
 *   4. https://eventlinqs.com          last-resort production default (never localhost)
 *
 * VERCEL_* are bare hostnames with no scheme, so https:// is prefixed.
 * The value is normalised to its origin (no trailing slash, no path) for
 * safe `${base}/path` concatenation, and guarded by `new URL(...)` so a
 * malformed env value degrades to the production default instead of
 * throwing inside metadata generation.
 *
 * This fix needs no environment-variable change to take effect: an unset
 * NEXT_PUBLIC_SITE_URL now resolves to the Vercel domain or the
 * production default rather than localhost. Setting NEXT_PUBLIC_SITE_URL
 * remains an optional explicit override, not a dependency.
 */

// HARD-01: the canonical production host is www. The Supabase Auth Site URL is
// https://www.eventlinqs.com, so auth cookies + sessions live on www; emitting
// links/emails on the apex would split the session across two hosts. Middleware
// 308-redirects the apex onto www to enforce this at runtime as well.
const PRODUCTION_FALLBACK = 'https://www.eventlinqs.com'

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function getSiteUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    PRODUCTION_FALLBACK

  try {
    return new URL(withScheme(candidate)).origin
  } catch {
    return PRODUCTION_FALLBACK
  }
}

/**
 * Absolute application origin for server-side redirect + link construction
 * (Stripe Connect onboarding return/refresh, payout emails, share links).
 *
 * HARD-07: this exists to KILL the `?? 'http://localhost:3000'` fallback that
 * was scattered across route handlers. A deployed environment must never emit a
 * localhost URL into a Stripe redirect or an email. NEXT_PUBLIC_APP_URL stays
 * the primary source (so an explicitly-set prod value still wins); when it is
 * absent we fall through the same deploy-safe chain as getSiteUrl() and finally
 * to the production origin - never localhost.
 *
 * Local development sets NEXT_PUBLIC_APP_URL=http://localhost:3000 in
 * .env.local, so dev still resolves to localhost via the env value itself, not
 * via a hardcoded fallback.
 */
export function getAppUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    PRODUCTION_FALLBACK

  try {
    return new URL(withScheme(candidate)).origin
  } catch {
    return PRODUCTION_FALLBACK
  }
}
