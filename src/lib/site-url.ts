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
 *   2. VERCEL_URL on PREVIEW deploys   the deployment itself - a preview's
 *      emails/links must resolve against the preview's own build + database,
 *      never the production domain (audit finding 2026-07-11: staging ticket
 *      emails pointed at production, where the ticket does not exist)
 *   3. VERCEL_PROJECT_PRODUCTION_URL   stable production domain (Vercel, build time)
 *   4. VERCEL_URL                      per-deployment URL (correct OG on preview deployments)
 *   5. https://eventlinqs.com          last-resort production default (never localhost)
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

// Canonical host ruling (founder, 2026-07-25): www.eventlinqs.com.au. Every
// other branded host 301s to it in src/proxy.ts, so this fallback must be the
// canonical host itself - emitting any other host here would put a redirect in
// front of every link we generate, and Stripe and some email clients do not
// follow redirects. Auth cookies and sessions live on this one host.
const PRODUCTION_FALLBACK = 'https://www.eventlinqs.com.au'

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function getSiteUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_URL : undefined) ||
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
 * The canonical host with no scheme, for the places that DISPLAY an address
 * rather than link to one: the slug hint under an organisation name, the
 * "your page lives here" line on an event, and the footer line printed onto a
 * share card.
 *
 * Every one of those was a hardcoded literal, and every one of them was wrong:
 * they read eventlinqs.com, and the canonical host has been
 * www.eventlinqs.com.au since the founder ruling of 25 July 2026. A wrong host
 * drawn onto a share card is a wrong host in front of a stranger.
 *
 * Safe in a client component: with no server environment to read, the resolver
 * falls through to the production constant, which is the canonical host.
 */
export function canonicalHost(): string {
  return getSiteUrl().replace(/^https?:\/\//, '')
}

/**
 * The host to PRINT onto an artefact, which is not always the host the artefact
 * links to.
 *
 * WHY THIS IS SEPARATE FROM canonicalHost(). That one follows getSiteUrl(), so
 * on a preview deployment it returns the deployment's own hostname. That is
 * correct for LINKS, deliberately so, because a preview's links must resolve
 * against the preview's own database. It is wrong for PRINT: the hostname is
 * about seventy characters, and a promoter's poster and story card were
 * rendering it with an ellipsis through the middle, which is not an address
 * anybody can type or trust (founder ruling 2026-08-13).
 *
 * So this resolver deliberately skips VERCEL_URL, the per-deployment host, and
 * prefers the stable production domain. The QR code and the caption links are
 * unaffected and still carry the working url.
 */
export function printableHost(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    PRODUCTION_FALLBACK

  try {
    return new URL(withScheme(candidate)).host
  } catch {
    return new URL(PRODUCTION_FALLBACK).host
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
    // Same preview carve-out as getSiteUrl(): on a preview deploy the
    // deployment's OWN url must win over VERCEL_PROJECT_PRODUCTION_URL, or
    // staging emits production links for tickets and payouts that only exist in
    // the TEST database. Without this line the production domain came first and
    // every preview-built link pointed at production.
    (process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_URL : undefined) ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    PRODUCTION_FALLBACK

  try {
    return new URL(withScheme(candidate)).origin
  } catch {
    return PRODUCTION_FALLBACK
  }
}
