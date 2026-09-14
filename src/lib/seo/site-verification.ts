import type { Metadata } from 'next'

/**
 * SEARCH CONSOLE OWNERSHIP, EMITTED FROM CONFIGURATION (close-out SEO2 step 2).
 *
 * WHY. Nothing on this platform has ever told Google who owns it, so nobody has
 * ever been able to read what Google thinks of it: not the indexed count, not
 * the exclusion reasons, not a single query. C19 was fought entirely from
 * exclusion reasons the owner read off a screen and pasted into a document,
 * because the build had no way to ask.
 *
 * WHAT IS THE MACHINE'S AND WHAT IS THE FOUNDER'S (Law 10 rule 2: hand him the
 * click and script the rest). The token is minted by Search Console for a signed
 * in Google account, and signing in is the irreducible act. Everything on either
 * side of it is scripted: `scripts/ops/search-console-verify.mjs` stores the
 * token on every Vercel scope, reads the deployed page back, and says whether
 * the tag is live. This module is the emission.
 *
 * THE TAG FORMAT is Google's own:
 *
 *   <meta name="google-site-verification" content="......." />
 *   placed within the <head> of the site's homepage
 *   https://support.google.com/webmasters/answer/9008080 (fetched 2026-09-14)
 *
 * and Next builds exactly that from `metadata.verification.google`
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md,
 * shipped with next@16.3.0, read 2026-09-14).
 *
 * THE TOKEN'S OWN GRAMMAR IS UNSOURCED. Google documents the TAG on the page
 * above and does not publish the alphabet or the length of the value inside it.
 * So the check below refuses only what would actually break: whitespace, quotes
 * and angle brackets, which would escape the attribute, and an implausible
 * length. It deliberately does not pattern-match a token shape nobody has
 * published, because a guess there would reject a valid token on the one day
 * somebody is trying to verify the property.
 *
 * A PASTED WHOLE TAG IS ACCEPTED. Search Console shows the complete element and
 * offers a copy button for it, so the whole element is what a person has on the
 * clipboard. Refusing it would be the script being right and the human being
 * stuck, which is the opposite of the point.
 */

/** The one variable name, so the manifest, the script and the emission agree. */
export const SITE_VERIFICATION_ENV = 'GOOGLE_SITE_VERIFICATION'

/** The meta name Google reads, written once. */
export const GOOGLE_VERIFICATION_META = 'google-site-verification'

/** Bounds, not a grammar. See the UNSOURCED note above. */
export const TOKEN_MIN_LENGTH = 20
export const TOKEN_MAX_LENGTH = 128

/** Anything here would escape the attribute or is simply not a token. */
const UNUSABLE = /[\s"'<>]/

/**
 * Pull a usable token out of whatever was configured: a bare token, or the whole
 * `<meta ... content="...">` element copied out of Search Console.
 *
 * Returns null with a reason rather than a bare null, because "the value is
 * wrong" and "there is no value" need different sentences and a build log is the
 * only place either will ever be read.
 */
export function readVerificationToken(raw: string | undefined | null): { token: string | null; reason: string | null } {
  const value = (raw ?? '').trim()
  if (!value) return { token: null, reason: null }

  // A whole element: take the content attribute, and only from a tag that names
  // Google, so a Bing or Yandex tag pasted here is refused rather than emitted
  // under Google's name.
  if (value.startsWith('<')) {
    const named = new RegExp(`name=["']${GOOGLE_VERIFICATION_META}["']`, 'i').test(value)
    if (!named) {
      return { token: null, reason: `the value looks like a meta element but does not name ${GOOGLE_VERIFICATION_META}` }
    }
    const content = /content=["']([^"']+)["']/i.exec(value)?.[1]?.trim()
    if (!content) return { token: null, reason: 'the value looks like a meta element but carries no content attribute' }
    return judge(content)
  }

  // `google-site-verification=TOKEN` is the DNS TXT form. Somebody verifying by
  // DNS and by tag in the same afternoon will paste it here eventually.
  const prefixed = new RegExp(`^${GOOGLE_VERIFICATION_META}[=:]\\s*(.+)$`, 'i').exec(value)
  if (prefixed) return judge(prefixed[1].trim())

  return judge(value)
}

function judge(token: string): { token: string | null; reason: string | null } {
  if (UNUSABLE.test(token)) {
    return { token: null, reason: 'the token carries whitespace, a quote or an angle bracket, which cannot go in an HTML attribute' }
  }
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    return {
      token: null,
      reason: `the token is ${token.length} characters, outside the ${TOKEN_MIN_LENGTH} to ${TOKEN_MAX_LENGTH} a Search Console token plausibly is`,
    }
  }
  return { token, reason: null }
}

/**
 * The `verification` fragment for the root layout's metadata, or an empty object.
 *
 * Spread rather than conditionally assigned, so a build with no token emits no
 * verification key at all rather than `verification: undefined`, which Next
 * would still have to reason about.
 *
 * A CONFIGURED BUT UNUSABLE VALUE IS SAID OUT LOUD. It is the only failure shape
 * that matters here: an absent token is a property nobody has verified yet, and
 * a broken one is somebody who believes they have.
 */
export function siteVerificationMetadata(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = console.warn,
): Pick<Metadata, 'verification'> {
  const { token, reason } = readVerificationToken(env[SITE_VERIFICATION_ENV])
  if (reason) {
    log(`[site-verification] ${SITE_VERIFICATION_ENV} is set and unusable, so no ${GOOGLE_VERIFICATION_META} tag is emitted: ${reason}`)
  }
  if (!token) return {}
  return { verification: { google: token } }
}
