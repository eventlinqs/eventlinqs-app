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
 * Stripe: "Make sure that the total length of the concatenated descriptor is no
 * more than 22 characters, including the `*` symbol and the space."
 * - https://docs.stripe.com/get-started/account/statement-descriptors
 * (fetched 2026-08-09)
 *
 * The platform prefix is "EL" (founder ruling, set in the Stripe Dashboard),
 * and Stripe renders the line as `PREFIX* SUFFIX`. So "EL* " costs 4 of the 22
 * and the suffix budget is 18.
 *
 * The two-character prefix follows the published competition rather than taste.
 * Eventbrite's own help centre gives "EB *CORGI FESTIVAL 202", which is exactly
 * 22 characters, spending 4 on the brand and 18 on the event. A ten-character
 * prefix would spend nearly half the line before the buyer learns anything
 * about what they bought.
 *
 * Capping here rather than letting Stripe truncate keeps the cut at a word
 * boundary where one exists, so a buyer reads "EL* BASEMENT 45" and not a
 * severed fragment.
 */
const SUFFIX_BUDGET = 18

/**
 * Typographic characters that appear in real event titles and must become plain
 * ASCII before they reach Stripe. The curly apostrophe is not a nicety: the
 * seeded title "A Doll's House on Stage at The Events Centre Caloundra" carries
 * U+2019, and Stripe REJECTS a suffix containing it.
 */
const TYPOGRAPHIC_REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚‛]/g, ''], // curly single quotes: Stripe forbids the straight form too
  [/[“”„‟]/g, ''], // curly double quotes: likewise
  [/[–—−]/g, '-'], // en dash, em dash, minus sign
  [/…/g, '...'], // ellipsis
]

/** Trailing joining words that survive truncation and say nothing. Cutting
 *  "A Dolls House on" back to "A Dolls House" costs no information and reads
 *  like a title rather than a sentence that ran out of room. */
const TRAILING_NOISE = /\s+(?:at|on|in|of|the|a|an|and|with|for|to|by|from|live)$/i

/** Trailing punctuation left dangling by a cut, e.g. "Fight Night:". */
const TRAILING_PUNCTUATION = /[\s,:;.\-&+/(]+$/

/**
 * Below this many characters a suffix stops identifying anything, so tidying
 * rules that would shorten it further are declined. "Women" tells a buyer
 * nothing; "Women in Leadershi" tells them exactly which event it was.
 */
const MIN_USEFUL_LENGTH = 12

/**
 * Truncate to the budget the way the published competition does.
 *
 * Eventbrite's help centre gives "EB *CORGI FESTIVAL 202", which is a HARD clip
 * that cuts "2026" mid-number rather than falling back to a word boundary. That
 * is the right trade: an earlier word-boundary implementation turned "Women in
 * Leadership Breakfast" into "Women" and "Afrobeats Amapiano Live at Townsville"
 * into "Afrobeats", neither of which identifies the event a buyer paid for.
 *
 * Only two tidies are applied on top, and both are refused when they would drop
 * the result below MIN_USEFUL_LENGTH: a dangling fragment of one or two
 * characters is dropped, and a dangling joining word is dropped.
 */
function truncateToBudget(cleaned: string): string {
  if (cleaned.length <= SUFFIX_BUDGET) {
    const tidied = cleaned.replace(TRAILING_NOISE, '').replace(TRAILING_PUNCTUATION, '')
    return tidied.length >= MIN_USEFUL_LENGTH || tidied.length === cleaned.length ? tidied : cleaned
  }

  let clipped = cleaned.slice(0, SUFFIX_BUDGET)

  // A cut that lands mid-word leaves a fragment. One or two characters is
  // debris ("Science and D"); anything longer still carries signal and stays.
  const cutMidWord = cleaned[SUFFIX_BUDGET] !== ' '
  if (cutMidWord) {
    const lastSpace = clipped.lastIndexOf(' ')
    const fragment = lastSpace >= 0 ? clipped.slice(lastSpace + 1) : ''
    if (lastSpace > 0 && fragment.length > 0 && fragment.length <= 2) {
      clipped = clipped.slice(0, lastSpace)
    }
  }

  clipped = clipped.replace(TRAILING_PUNCTUATION, '')

  // Drop a dangling joining word, repeatedly, but never below the useful floor.
  let tidied = clipped
  for (;;) {
    const next = tidied.replace(TRAILING_NOISE, '').replace(TRAILING_PUNCTUATION, '')
    if (next === tidied || next.length < MIN_USEFUL_LENGTH) break
    tidied = next
  }
  return tidied.trim()
}

/**
 * Derive the dynamic statement-descriptor suffix from an EVENT TITLE.
 *
 * The event title, not the organiser name, because that is what the buyer
 * remembers and what the published competition uses. Eventbrite's help centre
 * documents "EB *[event title] SAN FRANCISCO CA" and Humanitix's documents
 * "Tickets-[first 16 characters of the event title] MCMAHONS POINT". Somebody
 * who bought a ticket to Basement 45 remembers Basement 45, not the company
 * that ran it. It also disambiguates: two events from one organiser produce two
 * different statement lines, where an organiser-derived suffix produced two
 * identical ones.
 *
 * SANITISING IS A WHITELIST, NOT A BLACKLIST, and that distinction is load
 * bearing. Stripe publishes six forbidden characters, but stripping only those
 * is not enough: verified against the live TEST API on 2026-08-09, a suffix of
 * "Cafe Nino Fiesta" is accepted while "Cafe Nino Fiesta" with accents is
 * REJECTED outright, and an emoji title is accepted but silently mangled to
 * "Sunset ?? Rooftop". A rejected suffix makes `paymentIntents.create` throw,
 * which would break checkout for that event. So anything outside printable
 * ASCII is removed, after transliterating accents so "Cafe" survives as a word
 * rather than being gutted.
 *
 * Returns `null` when nothing usable survives. Null means no suffix is sent and
 * the charge falls back to the platform's static descriptor, which is the
 * pre-existing behaviour. Degrading to the status quo is the only safe failure
 * mode for a field that lands on a stranger's bank statement.
 */
export function statementDescriptorSuffix(eventTitle: string | null | undefined): string | null {
  if (!eventTitle) return null

  // Transliterate accents first, so "Café" becomes "Cafe" rather than "Caf".
  let cleaned = eventTitle.normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement)
  }
  // Everything still outside printable ASCII (emoji, Greek, CJK) becomes a
  // space rather than being deleted, so words either side do not fuse.
  cleaned = cleaned.replace(/[^\x20-\x7E]/g, ' ')
  cleaned = cleaned.replace(FORBIDDEN_DESCRIPTOR_CHARS, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Stripe requires the COMPLETE descriptor to contain at least one letter. The
  // platform prefix satisfies that alone, but a suffix with no letters (an event
  // titled "2026", or one that was pure emoji) reads as noise and is worse than
  // no suffix at all.
  if (!/[A-Za-z]/.test(cleaned)) return null

  const result = truncateToBudget(cleaned)
  return /[A-Za-z]/.test(result) ? result : null
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
