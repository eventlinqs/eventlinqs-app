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
 *   5. https://www.eventlinqs.com.au   the canonical host, and what PRODUCTION
 *      resolves to outright since the founder ruling of 2026-08-13 (never
 *      localhost, and never the secondary .com)
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

/** The host of the canonical origin, with no scheme. */
export const CANONICAL_HOST = 'www.eventlinqs.com.au'

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/**
 * PRODUCTION RESOLVES TO THE CANONICAL HOST, ALWAYS. Founder ruling 2026-08-13.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` used to sit above the fallback here, and on
 * this project Vercel nominates `eventlinqs.com` as the production url. So every
 * link this resolver produced on production, which is every Stripe Connect
 * return and refresh url, every email link, every QR payload and every share
 * link, was built on a host that 301s to the canonical one. The comment above
 * PRODUCTION_FALLBACK already said why that is a defect: Stripe and some email
 * clients do not follow redirects, and auth cookies live on the canonical host
 * alone.
 *
 * The preview carve-out is untouched and deliberate: a preview's links must
 * resolve against the preview's own deployment, because a preview kit's draft
 * exists only in the preview database and a link to production would 404.
 */
function resolveOrigin(explicitFirst: string | undefined): string {
  const candidate =
    explicitFirst ||
    (process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_URL : undefined) ||
    (process.env.VERCEL_ENV === 'production' ? PRODUCTION_FALLBACK : undefined) ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    PRODUCTION_FALLBACK

  try {
    return new URL(withScheme(candidate)).origin
  } catch {
    return PRODUCTION_FALLBACK
  }
}

export function getSiteUrl(): string {
  return resolveOrigin(process.env.NEXT_PUBLIC_SITE_URL)
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
  // The canonical host, and ONLY the canonical host.
  //
  // This used to prefer VERCEL_PROJECT_PRODUCTION_URL, which on this project is
  // `eventlinqs.com`, so the poster and the story cards printed a secondary host
  // that 301s. Founder ruling 2026-08-13: eventlinqs.com is never printed,
  // emitted, embedded, linked or handed to a machine on production.
  //
  // An explicit NEXT_PUBLIC_SITE_URL is honoured only when it ALREADY resolves
  // to the canonical host. That is not a courtesy, it is the point: a
  // misconfigured variable must not be able to reintroduce a secondary host onto
  // a printed artefact, and there is no legitimate reason to print any other.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) {
    try {
      if (new URL(withScheme(explicit)).host === CANONICAL_HOST) return CANONICAL_HOST
    } catch {
      /* malformed: fall through to the canonical host */
    }
  }
  return CANONICAL_HOST
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
  // Shares resolveOrigin with getSiteUrl, so the preview carve-out and the
  // production canonical rule cannot drift apart between the two. This is the
  // resolver behind Stripe Connect return and refresh urls, so a redirecting
  // host here is the most expensive version of the defect: Stripe does not
  // follow redirects on a return url.
  return resolveOrigin(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL)
}
