import type { ShareChannel } from '@/lib/broadcast/share-codes'

/**
 * THE SHARE LINK FORMAT.
 *
 * www.eventlinqs.com.au/e/basement-45-ig
 *
 * THE EVIDENCE BEHIND THE SHAPE, read from the platforms themselves:
 *
 * - Eventbrite's own default event address is /e/[slug].
 * - DICE uses dice.fm/event/, dice.fm/venue/, dice.fm/promoters/.
 * - Ticketmaster uses descriptive path segments.
 * - Eventbrite Help, "Customize your event link": the premium form is a
 *   SUBDOMAIN, "Eventbrite will add .eventbrite.com for you, so you just need
 *   to enter the first part", and the same article publishes the hazard:
 *   "Your original event link will still work, but your custom event link
 *   can't be redirected to a different web address."
 *
 * Not one of them uses a two-letter opaque prefix. /s/ is a URL-shortener
 * convention (bit.ly, t.co) and it appeared nowhere in this market.
 *
 * WHY NOT THE FULL /events/ PATH. Measured on the rendered card: the event
 * path with a channel marker runs to 72 characters, which forces the ticket
 * bar type down to roughly 21 pixels against the 38 the design uses. /e/ with
 * the slug stem is 31 and sits at full scale.
 *
 * THE CHANNEL RIDES THE SLUG. A suffix, not a query parameter, so the whole
 * address is one readable token a person can retype from a poster, and so
 * nothing is lost when a platform strips query strings.
 */

/** The namespace this platform serves readable share links from. */
export const SHORT_LINK_SEGMENT = 'e'

/** The legacy namespace. Printed on posters already in venue windows. */
export const LEGACY_SHORT_LINK_SEGMENT = 's'

/**
 * Two-letter markers, chosen to be guessable rather than clever: a promoter
 * reading their own reach panel should be able to tell which link is which
 * without a legend.
 */
export const CHANNEL_MARKERS: Record<ShareChannel, string> = {
  instagram: 'ig',
  facebook: 'fb',
  linkedin: 'li',
  x: 'x',
  whatsapp: 'wa',
  messenger: 'ms',
  email: 'em',
  sms: 'sm',
  copy: 'cp',
  native: 'sh',
  qr: 'qr',
  other: 'ot',
}

const MARKER_TO_CHANNEL: Record<string, ShareChannel> = Object.fromEntries(
  Object.entries(CHANNEL_MARKERS).map(([channel, marker]) => [marker, channel as ShareChannel]),
) as Record<string, ShareChannel>

/**
 * RESERVED. A minted code may never equal one of these, because a first path
 * segment is a namespace and two things cannot own the same one.
 *
 * This list is asserted against the real app directory by
 * scripts/guards/short-link-namespace.mjs, which fails the build if a route is
 * added that is not here, so it cannot drift into a false sense of safety.
 */
export const RESERVED_CODES: readonly string[] = [
  // Every first path segment the app owns today. The guard reads the app
  // directory and fails the build if one is missing from this list, so a route
  // added next month cannot quietly start colliding with a link minted today.
  'about', 'account', 'actions', 'admin', 'api', 'artist', 'artists', 'auth',
  'careers', 'categories', 'checkout', 'cities', 'city', 'communities',
  'community', 'contact', 'dashboard', 'design', 'dev', 'e', 'events', 'faith',
  'feed', 'for-organisers', 'forgot-password', 'gigs', 'guides', 'help', 'join',
  'legal', 'login', 'orders', 'organisers', 'press', 'pricing', 'queue', 's',
  'scan', 'signup', 'squad', 't', 'tickets', 'unsubscribe', 'venues',
  'verify-email-sent', 'waitlist',
  // Held back on purpose: the permanent redirects from the community rename,
  // and the obvious next routes. Cheap to reserve, expensive to reclaim.
  'blog', 'cart', 'culture', 'cultures', 'logout', 'music', 'reset', 'robots',
  'search', 'settings', 'sitemap', 'support', 'terms',
]

/**
 * The slug stem a code is built from: readable, short, never mid-word.
 *
 * 20 characters, not 28. At 28 the rendered story card clipped its own ticket
 * bar: "From $35 · www.eventlinqs.com.au/e/basement-45-warehouse-ig" is 59
 * characters and there are about 654 pixels of bar to draw it in. 20 gives
 * "basement-45", which is the shape the founder proposed and which sits at full
 * type scale on every format. A promoter reading it aloud says the name of
 * their night, not a paragraph.
 */
export function codeStem(eventSlug: string, maxLength = 20): string {
  const clean = eventSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > maxLength * 0.5 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

/**
 * The code for one event and one channel.
 *
 * @param disambiguator appended when the preferred code is already taken by a
 *   DIFFERENT event. Two events called "winter-market" get winter-market-ig and
 *   winter-market-ig-2, and the second one keeps that code for good.
 */
export function buildReadableCode(
  eventSlug: string,
  channel: ShareChannel,
  disambiguator?: number,
): string {
  const stem = codeStem(eventSlug) || 'event'
  const marker = CHANNEL_MARKERS[channel] ?? CHANNEL_MARKERS.other
  const base = `${stem}-${marker}`
  return disambiguator && disambiguator > 1 ? `${base}-${disambiguator}` : base
}

/**
 * Strict format gate for a readable code, applied BEFORE the database sees the
 * value, exactly as the legacy gate is. Lowercase letters, digits and single
 * hyphens; 3 to 48 characters; never a reserved segment.
 */
const READABLE_CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidReadableCode(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 3 || value.length > 48) return false
  if (!READABLE_CODE_RE.test(value)) return false
  return !RESERVED_CODES.includes(value)
}

/** The channel a readable code was minted for, when it carries a marker. */
export function channelFromCode(code: string): ShareChannel | null {
  const parts = code.split('-')
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 2); i -= 1) {
    const candidate = MARKER_TO_CHANNEL[parts[i]]
    if (candidate) return candidate
  }
  return null
}

/** The absolute share URL for a code, on the readable namespace. */
export function buildEventShortUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/${SHORT_LINK_SEGMENT}/${code}`
}
