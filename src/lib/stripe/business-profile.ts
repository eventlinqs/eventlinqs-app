import { getSiteUrl } from '@/lib/site-url'

/**
 * The connected-account business profile: what the platform already knows about
 * an organiser, shaped for Stripe.
 *
 * WHY THIS FILE EXISTS. Until now `createExpressAccount` passed Stripe only
 * `country` and `email`, so Stripe's hosted onboarding form opened with the
 * business-name box empty and the organiser had to type a name the platform was
 * already holding in `organisations.name`. On production the founder registered
 * "Party Pty Ltd", was shown a blank field, and typed "Eventlinqs" with the
 * website "https://eventlinqs.com" - neither the organisation's real name nor
 * the canonical host. Two organiser accounts on TEST carry the identical damage
 * (acct_1TkUNdGvPFuaplvP and acct_1TkUM42esnSE7XnC, both
 * business_profile.url = https://eventlinqs.com, both descriptor
 * "EVENTLINQS.COM"), which is the same defect reproducing, not a one-off slip.
 *
 * Stripe's create-account reference (fetched 2026-08-09,
 * https://docs.stripe.com/api/accounts/create):
 *
 *   business_profile.name          "The customer-facing business name."
 *   business_profile.url           "The business's publicly available website."
 *   business_profile.support_email "A publicly available email address for
 *                                   sending support issues to." (max 800 chars)
 *   business_profile.support_phone "A publicly available phone number to call
 *                                   with support issues."
 *   business_profile.product_description
 *                                  "Internal-only description of the product
 *                                   sold by, or service provided by, the
 *                                   business. Used by Stripe for risk and
 *                                   underwriting purposes."
 *
 * And on prefilling generally (https://docs.stripe.com/api/accounts/create):
 * "If you've already collected information for your connected accounts, you can
 * prefill that information when creating the account. Connect Onboarding won't
 * ask for the prefilled information during account onboarding."
 *
 * WHAT IS DELIBERATELY NOT PREFILLED. `business_profile.mcc` is not set here.
 * The brief is to prefill every field the platform ALREADY HOLDS, and the
 * merchant category is not one of them: it is a per-organiser classification
 * that feeds Stripe's risk and underwriting, and the organisers on TEST
 * demonstrably disagree about their own (acct_1TpM2qGd7gIG9zbn chose 7922
 * "theatrical producers and ticket agencies", acct_1TkUNdGvPFuaplvP chose 7929
 * "bands, orchestras, entertainers"). A blanket platform default would be wrong
 * for a real share of them, so the organiser keeps answering it.
 */

/** The organisation columns this module needs. Kept narrow so the callers'
 *  `select(...)` lists stay honest about what they actually read. */
export type OrganisationProfileFields = {
  name: string
  slug: string
  email: string | null
  phone: string | null
}

/** Exactly the subset of Stripe's `business_profile` that we prefill. */
export type ConnectBusinessProfile = {
  name: string
  url: string
  product_description: string
  support_email?: string
  support_phone?: string
}

/**
 * The organiser's public EventLinqs page, resolved through `getSiteUrl()` so it
 * carries the canonical host and never a literal.
 *
 * This is the URL handed to Stripe rather than `organisations.website` for
 * three reasons. It always resolves: organisations are created with
 * `status: 'active'` and `/organisers/[handle]` looks the row up by slug, so the
 * page is live the moment onboarding starts, whereas `website` is free text a
 * user may leave blank or mistype, and a dead URL in front of Stripe's
 * underwriters is a stalled account. It is a host we control, which matters
 * because Stripe folds `business_profile.url` into the statement descriptor it
 * generates during onboarding. And it is the page the buyer actually bought on.
 */
export function organiserPublicUrl(slug: string): string {
  return `${getSiteUrl()}/organisers/${slug}`
}

/**
 * Build the prefill payload from what the platform holds.
 *
 * `fallbackEmail` is the signed-in user's address, used only when the
 * organisation has no email of its own - the same precedence the onboarding
 * route already applies to the account-level `email` field.
 */
export function buildConnectBusinessProfile(
  org: OrganisationProfileFields,
  fallbackEmail: string | null
): ConnectBusinessProfile {
  const supportEmail = (org.email ?? fallbackEmail ?? '').trim()
  const supportPhone = (org.phone ?? '').trim()

  return {
    name: org.name.trim(),
    url: organiserPublicUrl(org.slug),
    // Internal-only, never shown to a buyer. Every organiser on this platform
    // sells the same thing, so unlike the MCC this genuinely is a fact the
    // platform holds, and giving it to Stripe up front speeds underwriting.
    product_description: 'Event ticket sales through the EventLinqs marketplace',
    ...(supportEmail.length > 0 ? { support_email: supportEmail.slice(0, 800) } : {}),
    ...(supportPhone.length > 0 ? { support_phone: supportPhone } : {}),
  }
}

// ── Statement descriptor ────────────────────────────────────────────────────

/**
 * Characters Stripe forbids in a statement descriptor.
 *
 * The authoritative list is the requirements page, not the dispute guide. A
 * complete descriptor "Doesn't contain any of the following special characters:
 * `<`, `>`, `\`, `'` `"` `*`."
 * - https://docs.stripe.com/get-started/account/statement-descriptors
 * (fetched 2026-08-09).
 *
 * The backslash and the ASTERISK matter and are easy to miss: Stripe builds the
 * complete descriptor as `prefix* suffix`, so an asterisk arriving from an
 * organisation name would produce a second separator in the middle of the line
 * a buyer reads on their statement.
 */
const FORBIDDEN_DESCRIPTOR_CHARS = /["'<>\\*]/g

/**
 * The longest suffix we will send.
 *
 * "Card networks receive only the first 22 characters (including the `*` symbol
 * and the space that concatenates the static prefix and dynamic suffix) of the
 * complete statement descriptor."
 * - https://docs.stripe.com/connect/statement-descriptors (fetched 2026-08-09)
 *
 * The platform's prefix is 6 characters today ("ELINQS"), which leaves 14 after
 * "ELINQS* ". Capping here rather than letting Stripe truncate keeps the cut at
 * a word boundary where one is available, so a buyer reads "ELINQS* PARTY PTY"
 * and not a severed fragment. Stripe still truncates if the founder later
 * lengthens the prefix, so this cap is a quality floor, not a correctness
 * dependency.
 */
const MAX_SUFFIX_LENGTH = 14

/**
 * Derive the dynamic statement-descriptor suffix from an organiser's name.
 *
 * Returns `null` when nothing usable survives sanitising. Null means we send no
 * suffix at all, and the charge falls back to the platform's full static
 * descriptor - today's exact behaviour. Degrading to the status quo is the only
 * safe failure mode for a field that ends up on a stranger's bank statement.
 */
export function statementDescriptorSuffix(organisationName: string | null | undefined): string | null {
  if (!organisationName) return null

  const cleaned = organisationName
    .replace(FORBIDDEN_DESCRIPTOR_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Stripe requires the COMPLETE descriptor to hold at least 5 letters. The
  // platform prefix already satisfies that on its own, but a suffix with no
  // letters at all (say an organisation named "2026") reads as noise on a
  // statement and is worse than no suffix.
  if (!/[A-Za-z]/.test(cleaned)) return null

  if (cleaned.length <= MAX_SUFFIX_LENGTH) return cleaned

  // Prefer a word boundary inside the budget; fall back to a hard cut.
  const clipped = cleaned.slice(0, MAX_SUFFIX_LENGTH)
  const lastSpace = clipped.lastIndexOf(' ')
  const atBoundary = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped
  return /[A-Za-z]/.test(atBoundary) ? atBoundary.trim() : clipped.trim()
}

// ── Divergence between what we hold and what Stripe holds ───────────────────

export type NameDivergence =
  | { status: 'match' }
  | { status: 'not_set' }
  | { status: 'diverged'; platformName: string; stripeName: string }

/**
 * Casefold and drop punctuation so "Party Pty. Ltd." and "Party Pty Ltd" are
 * treated as the same name. Deliberately does NOT strip company suffixes: the
 * gap between "Party" and "Party Pty Ltd" is a real difference in the legal
 * name a buyer sees, not noise to be smoothed away.
 */
export function normaliseBusinessName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Compare the organisation name the platform holds against the business name on
 * the connected Stripe account.
 *
 * An organiser can still edit the name inside Stripe's hosted form and inside
 * the Express Dashboard afterwards, so prefilling closes the hole at creation
 * but cannot keep it closed. Silent disagreement between the two records is
 * precisely what produced "Party Pty Ltd" on this platform and "Eventlinqs" at
 * Stripe, and nothing anywhere reported it. This makes it reportable.
 *
 * `not_set` is not a divergence: it means onboarding has not yet reached the
 * business-details step, which is an ordinary in-progress state.
 */
export function businessNameDivergence(
  platformName: string,
  stripeName: string | null | undefined
): NameDivergence {
  const stripeTrimmed = (stripeName ?? '').trim()
  if (stripeTrimmed.length === 0) return { status: 'not_set' }
  if (normaliseBusinessName(platformName) === normaliseBusinessName(stripeTrimmed)) {
    return { status: 'match' }
  }
  return { status: 'diverged', platformName: platformName.trim(), stripeName: stripeTrimmed }
}
