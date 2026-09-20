import { SOURCE_CATEGORY, type SourceCategory } from './source-categories.generated'

/**
 * WHICH CHANNEL BROUGHT A VISIT, AND THE ONE DISTINCTION CLOSE-OUT AQ3 TURNS ON:
 * SEARCH TRAFFIC WE DID NOT PAY FOR, COUNTED SEPARATELY FROM PEOPLE WHO TYPED
 * THE ADDRESS.
 *
 * ===========================================================================
 * WHERE THE RULES COME FROM, AND WHY NOT FROM HERE
 * ===========================================================================
 *
 * Every predicate below is Google's own published default channel group rule,
 * quoted beside the code that implements it:
 *
 *   https://support.google.com/analytics/answer/9756891  (fetched 2026-09-19)
 *
 * and the list of sites each rule matches against is Google's published source
 * table, fetched into ./source-categories.generated.ts by
 * scripts/ops/refresh-ga-source-categories.mjs and sealed with a digest a guard
 * recomputes. Law 7: a specification about a third party is fetched and cited,
 * never stated from memory.
 *
 * ===========================================================================
 * THE TRAP THAT READING THE SOURCE AVOIDED
 * ===========================================================================
 *
 * The platform stores a referring HOST. Google's table lists SOURCES. They are
 * not the same thing and the difference is not cosmetic: the table carries the
 * bare token `google` and carries no entry at all for `google.com.au`,
 * `google.com` or `www.google.com`. Matching a host straight against the table
 * would have classified every visit Google sends us as a referral, and the
 * platform would have answered "is the search work paying for itself" with a
 * confident, permanent no.
 *
 * So a host is REDUCED to a source first, by `sourceTokenForHost`, and that
 * reduction is ours rather than Google's, because Google does not publish
 * theirs. It is deliberately conservative: an exact match first, then a single
 * pass over the host's labels looking for a bare token. A host that reduces to
 * nothing is a referral, so the failure direction is UNDER-reporting search,
 * which is the safe way for a number that is used to justify more search work.
 *
 * KNOWN LIMITS, named rather than left to be discovered:
 *
 *   - `search.brave.com` is not in Google's table at all, so Brave search
 *     traffic reads as a referral. That is the published table's answer, not a
 *     bug here, and it is corrected the day Google adds the entry and the
 *     refresh script is run.
 *   - the label pass can over-reach on a host whose brand label is also a bare
 *     search token: `ask.fm` is not in the table, its label `ask` is, so it
 *     would read as search. The reduction is one rule rather than a list of
 *     hand-written exceptions, because a hand-written exception list is exactly
 *     the invented specification Law 7 forbids.
 *
 * ===========================================================================
 * WHAT IS NOT IMPLEMENTED, AND WHY
 * ===========================================================================
 *
 *   Cross-network, and the Google Ads half of several rules, need the Google
 *   Ads ad network type, which this platform does not have and will not invent.
 *
 *   Paid Shopping and Organic Shopping are left out because the two rules as
 *   published could not be told apart with confidence on the day they were
 *   fetched, and a ticketing platform has no shopping-feed traffic. A shopping
 *   source therefore reads as a referral, which is a true statement about a
 *   site that linked to us.
 *
 * A channel this file cannot decide is `unassigned`, which is Google's own name
 * for the same situation. Nothing is ever silently folded into `direct`:
 * `direct` means the request carried no referrer and no campaign label at all,
 * and that is the only thing it ever means.
 */

/** The channels this platform reports. `unassigned` is Google's own name. */
export type TrafficChannel =
  | 'organic-search'
  | 'paid-search'
  | 'organic-social'
  | 'paid-social'
  | 'organic-video'
  | 'paid-video'
  | 'display'
  | 'paid-other'
  | 'email'
  | 'referral'
  | 'direct'
  | 'unassigned'

/**
 * Reading order on every surface: the question AQ3 asks is answered by the
 * first two, and everything after them is context rather than the answer.
 */
export const TRAFFIC_CHANNELS: readonly TrafficChannel[] = [
  'organic-search',
  'direct',
  'organic-social',
  'referral',
  'email',
  'organic-video',
  'paid-search',
  'paid-social',
  'paid-video',
  'display',
  'paid-other',
  'unassigned',
]

/** What a channel is called on screen, and the sentence that explains it. */
export const TRAFFIC_CHANNEL_COPY: Readonly<
  Record<TrafficChannel, { label: string; meaning: string }>
> = {
  'organic-search': {
    label: 'Organic search',
    meaning: 'A search engine sent them and nobody paid for the click.',
  },
  direct: {
    label: 'Direct',
    meaning: 'No referring site and no campaign label: typed, bookmarked, or from an app that sends neither.',
  },
  'organic-social': {
    label: 'Social',
    meaning: 'A social site sent them, unpaid. A share on Instagram lands here.',
  },
  referral: {
    label: 'Referral',
    meaning: 'Another site linked to us: a venue page, a listing, a blog.',
  },
  email: {
    label: 'Email',
    meaning: 'One of our own emails, which label themselves as email.',
  },
  'organic-video': {
    label: 'Video',
    meaning: 'A video site sent them, unpaid.',
  },
  'paid-search': {
    label: 'Paid search',
    meaning: 'A search engine sent them and the click was bought.',
  },
  'paid-social': {
    label: 'Paid social',
    meaning: 'A social site sent them and the click was bought.',
  },
  'paid-video': {
    label: 'Paid video',
    meaning: 'A video site sent them and the click was bought.',
  },
  display: {
    label: 'Display',
    meaning: 'A banner or an interstitial placement.',
  },
  'paid-other': {
    label: 'Paid, other',
    meaning: 'A bought click that names no site we recognise.',
  },
  unassigned: {
    label: 'Unassigned',
    meaning: 'Something was recorded and no rule matched it. Google uses the same word.',
  },
}

/** What the platform stores about where one visit came from. */
export type ChannelInput = {
  referrer: string | null | undefined
  utmSource: string | null | undefined
  utmMedium: string | null | undefined
  utmCampaign?: string | null | undefined
}

/** Bare tokens only. A dotted entry is matched exactly, never as a label. */
const BARE_TOKENS: ReadonlyMap<string, SourceCategory> = new Map(
  Object.entries(SOURCE_CATEGORY).filter(([name]) => !name.includes('.')) as Array<[string, SourceCategory]>,
)

function normaliseHost(referrer: string | null | undefined): string | null {
  const raw = (referrer ?? '').trim().toLowerCase()
  if (!raw) return null
  // The ledger stores a host, but a caller holding a full URL should not get a
  // wrong answer for it: take the host out if one is there.
  const host = raw.includes('://') ? safeHost(raw) : raw.split('/')[0]
  if (!host) return null
  return host.replace(/^www\./, '') || null
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * The reduction: a referring host to one of Google's source names.
 *
 * Exact first (`au.search.yahoo.com`, `ecosia.org`, `t.co` are all published
 * exactly), then one left-to-right pass over the labels for a bare token
 * (`www.google.com.au` -> `google`, `m.facebook.com` -> `facebook`).
 * Left to right, and documented as such, so the answer for a host carrying two
 * tokens is decided by a rule rather than by iteration order.
 */
export function sourceTokenForHost(referrer: string | null | undefined): string | null {
  const host = normaliseHost(referrer)
  if (!host) return null
  if (SOURCE_CATEGORY[host]) return host
  for (const label of host.split('.')) {
    if (BARE_TOKENS.has(label)) return label
  }
  return null
}

/** The category of the site that referred this visit, if we can name one. */
export function categoryForHost(referrer: string | null | undefined): SourceCategory | null {
  const token = sourceTokenForHost(referrer)
  return token ? (SOURCE_CATEGORY[token] ?? null) : null
}

/**
 * The category a campaign's own `utm_source` claims.
 *
 * A campaign may name its source directly (`utm_source=google`), which is the
 * form Google's table was written for, so it is matched against the table
 * exactly rather than reduced.
 */
function categoryForUtmSource(utmSource: string | null | undefined): SourceCategory | null {
  const value = (utmSource ?? '').trim().toLowerCase()
  if (!value) return null
  return SOURCE_CATEGORY[value] ?? null
}

/** "Medium matches regex ^(.*cp.*|ppc|retargeting|paid.*)$" */
const PAID_MEDIUM = /^(.*cp.*|ppc|retargeting|paid.*)$/

/** "Medium is one of ('social', 'social-network', 'social-media', 'sm', 'social network', 'social media')" */
const SOCIAL_MEDIA = new Set(['social', 'social-network', 'social-media', 'sm', 'social network', 'social media'])

/** "Medium is one of ('display', 'banner', 'expandable', 'interstitial', 'cpm')" */
const DISPLAY_MEDIA = new Set(['display', 'banner', 'expandable', 'interstitial', 'cpm'])

/** "Medium is one of ('referral', 'app', or 'link')" */
const REFERRAL_MEDIA = new Set(['referral', 'app', 'link'])

/** "Source = email|e-mail|e_mail|e mail OR Medium = email|e-mail|e_mail|e mail" */
const EMAIL_NAMES = new Set(['email', 'e-mail', 'e_mail', 'e mail'])

function lower(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * The one decision, in Google's own rule order.
 *
 * ORDER IS PART OF THE SPECIFICATION, not a detail of this implementation. A
 * visit from Instagram carrying `utm_medium=email` is Organic Social by the
 * published table, because the social rule sits above the email rule, and a
 * reimplementation that checked email first would quietly disagree with every
 * other tool the owner might ever compare this against.
 */
export function channelForVisit(input: ChannelInput): TrafficChannel {
  const medium = lower(input.utmMedium)
  const source = lower(input.utmSource)
  const host = normaliseHost(input.referrer)
  const campaign = lower(input.utmCampaign)

  // "Direct: Source exactly matches '(direct)' AND Medium is one of
  // ('(not set)', '(none)')". Here: the request carried nothing at all.
  if (!host && !source && !medium && !campaign) return 'direct'

  const category = categoryForHost(input.referrer) ?? categoryForUtmSource(input.utmSource)
  const paid = medium.length > 0 && PAID_MEDIUM.test(medium)

  if (category === 'search' && paid) return 'paid-search'
  if (category === 'social' && paid) return 'paid-social'
  if (category === 'video' && paid) return 'paid-video'
  if (DISPLAY_MEDIA.has(medium)) return 'display'
  if (paid) return 'paid-other'

  if (category === 'social' || SOCIAL_MEDIA.has(medium)) return 'organic-social'
  if (category === 'video' || /video/.test(medium)) return 'organic-video'
  if (category === 'search' || medium === 'organic') return 'organic-search'

  if (EMAIL_NAMES.has(source) || EMAIL_NAMES.has(medium)) return 'email'

  // "Referral: Medium is one of ('referral', 'app', or 'link')". A referring
  // host with no campaign medium at all is the same thing said a different way:
  // the analytics tool that wrote Google's rule sets medium=referral itself for
  // exactly this traffic, and we store the host instead of the medium.
  if (REFERRAL_MEDIA.has(medium) || host) return 'referral'

  return 'unassigned'
}
