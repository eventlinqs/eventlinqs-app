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

const PRODUCTION_FALLBACK = 'https://eventlinqs.com'

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
