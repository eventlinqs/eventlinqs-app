/**
 * WHERE AN ORGANISER FOUND US (Lawal's rulings of 26 November 2026, 22:52 and 23:01; EVENTLINQS-SOCIAL-ORGANISER-ENGINE-
 * LOCKED-26NOV.md version 2, section 3: "the form records no source. Capture of the source channel is the first fix"; the
 * PM's car K lean, item K1, live by Friday 27 November 18:00 so the pilot's organisers can be traced). Pure.
 *
 * The channel links: eventlinqs.com.au/list?src=ig, fb, email, qr or ref (src/app/list/route.ts) open the listing form
 * with its answer to "Where did you find us?" already chosen. The form then records four answers on the submission
 * (migration 20261126200001): where they found us, where else they list or sell, their main social account, and how often
 * they run events. Every answer is optional: a source never stands between an organiser and a free listing.
 */

/** The channel link's codes, as the pilot's messages and flyers carry them. */
export const LIST_LINK_SOURCES = ['ig', 'fb', 'email', 'qr', 'ref'] as const
export type ListLinkSource = (typeof LIST_LINK_SOURCES)[number]

export const FOUND_US = ['instagram', 'facebook', 'email', 'qr', 'referral', 'search', 'other'] as const
export type FoundUs = (typeof FOUND_US)[number]

export const FOUND_US_WORDS: Readonly<Record<FoundUs, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  email: 'An email from EventLinqs',
  qr: 'A QR code or flyer',
  referral: 'Another organiser told me',
  search: 'A search engine',
  other: 'Somewhere else',
}

export const FREQUENCIES = ['once', 'monthly', 'fortnightly', 'weekly', 'more_than_weekly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const FREQUENCY_WORDS: Readonly<Record<Frequency, string>> = {
  once: 'Just this one',
  monthly: 'About once a month',
  fortnightly: 'Every two weeks',
  weekly: 'Every week',
  more_than_weekly: 'More than once a week',
}

const SRC_TO_FOUND: Readonly<Record<ListLinkSource, FoundUs>> = { ig: 'instagram', fb: 'facebook', email: 'email', qr: 'qr', ref: 'referral' }

/** A channel link's code, or null for anything else. Pure. */
export function listLinkSource(src: string | null | undefined): ListLinkSource | null {
  const s = (src ?? '').trim().toLowerCase()
  return (LIST_LINK_SOURCES as readonly string[]).includes(s) ? (s as ListLinkSource) : null
}

/** The form's "Where did you find us?" answer a channel link chooses, or '' for none. Pure. */
export function foundUsFromSrc(src: string | null | undefined): FoundUs | '' {
  const code = listLinkSource(src)
  return code ? SRC_TO_FOUND[code] : ''
}

/** The four answers as the submission stores them; anything not on its list, or too long, is left out. Pure. */
export type SourceAnswers = {
  readonly found_us: FoundUs | null
  readonly found_us_src: ListLinkSource | null
  readonly also_listed_on: string | null
  readonly social_account: string | null
  readonly event_frequency: Frequency | null
}

const short = (v: string, most: number) => {
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t.slice(0, most)
}

export function sourceAnswersOf(field: (name: string) => string): SourceAnswers {
  const found = field('found_us').trim()
  const freq = field('event_frequency').trim()
  return {
    found_us: (FOUND_US as readonly string[]).includes(found) ? (found as FoundUs) : null,
    found_us_src: listLinkSource(field('src')),
    also_listed_on: short(field('also_listed_on'), 200),
    social_account: short(field('social_account'), 200),
    event_frequency: (FREQUENCIES as readonly string[]).includes(freq) ? (freq as Frequency) : null,
  }
}
