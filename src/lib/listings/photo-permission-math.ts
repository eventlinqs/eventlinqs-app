/**
 * THE WORDS OF AN ORGANISER'S PHOTO PERMISSION (./photo-permission.ts). Their yes is kept in the words the page showed
 * them, with who gave it and for which night, so the register's evidence reads as what they agreed to. Pure.
 */

/**
 * The register's scope for an organiser's images: that night's own page and cards ('site'), EventLinqs' social posts
 * ('social'), or both. Every yes is promotion of the night: a yes given before the one tick (a 'site' or 'social' box on
 * the old page) keeps working exactly where it was given, and the one tick gives 'both'.
 */
export type PhotoUses = 'site' | 'social' | 'both'

/**
 * ONE TICK, ONE CHECKBOX (Lawal, 13:49 of 23 November 2026: "One tick, they read through everything ... One tick, one
 * checkbox ... We are just promoting the event ... Let EventLinqs be the most easiest platform organizers ever know").
 * The page asks once, in these words, and the tick is the whole grant: the site, the event cards and social posts as
 * before ('both'), and EventLinqs' emails, which the words name.
 */
export const ONE_TICK_USES: PhotoUses = 'both'

/** The one checkbox, in the organiser's voice as the page shows it; the recorded yes (grantWording) says the same. */
export const ONE_TICK_WORDS =
  'I took these or have the right to share them, and anyone identifiable in them has agreed. EventLinqs may use them to promote this event and our future events on EventLinqs, in its social posts and in its emails, resized, cropped or placed inside EventLinqs designs. Not paid advertising, and never sold.'

/** The register's permitted uses for a one tick yes, in plain words. */
export function permittedUsesWords(): string {
  return "To promote this night and the organiser's future events on EventLinqs (its pages and event cards), in EventLinqs' social posts and in its emails, resized, cropped or placed inside EventLinqs designs, as the organiser agreed with one tick on their EventLinqs photo page; not paid advertising, and never sold."
}

/**
 * THE ORGANISER MEDIA DECLARATION, version of 23 November 2026 (the one tick, Lawal's 13:49), after that of 19 November
 * 2026 (law 32, the PM's 13:30, on Lawal's 13:20): the organiser confirms they took the images or may share them,
 * INCLUDING the agreement of anyone identifiable in them, and EventLinqs may use them to promote the event and their
 * future events. A yes given before this date keeps the words it was given in (the database holds each yes's own words).
 */
export const DECLARATION_VERSION = '23 November 2026'

/**
 * THE ONE DECISION FOR AN ORGANISER'S IMAGE (law 32 (c) and (e)): approved when the organiser's grant covers where it
 * goes and no concrete concern is written down; otherwise held with its own reason. The concerns are the only ones
 * law 32 names, each with evidence written beside it: they say they lack the rights, another owner's mark with no
 * licence, an objection or takedown from a person shown, or sensitive content (names or schools attached to children,
 * a private setting, distress, anything sexual). What the image shows is never a reason by itself: children or a
 * family in an organiser's photograph of their own public event are not a concern (Lawal, 19 November 2026, 13:20).
 */
export type MediaConcern = 'rights_denied' | 'third_party_mark' | 'objection' | 'sensitive'
export type MediaDecision = { readonly state: 'approved' } | { readonly state: 'held'; readonly reason: 'no_authorisation' | 'outside_scope' | MediaConcern }

export function mediaDecision(input: { readonly grant: { readonly uses: PhotoUses } | null; readonly placement: 'site' | 'social'; readonly concerns?: readonly MediaConcern[] }): MediaDecision {
  const concern = input.concerns?.[0]
  if (concern) return { state: 'held', reason: concern }
  if (input.grant === null) return { state: 'held', reason: 'no_authorisation' }
  if (input.grant.uses !== 'both' && input.grant.uses !== input.placement) return { state: 'held', reason: 'outside_scope' }
  return { state: 'approved' }
}

/** Their yes, as the page put it to them (ONE_TICK_WORDS) and as they gave it, for the night and the images kept. */
export function grantWording(input: { readonly givenBy: string; readonly organiserName: string; readonly nightTitle: string; readonly count: number }): string {
  const images = input.count === 1 ? 'the image' : `the ${input.count} images`
  const them = input.count === 1 ? 'it' : 'them'
  const night = input.nightTitle.trim()
  return `${input.givenBy.trim()}, for ${input.organiserName.trim()}: I took ${images} I added for ${night}, or have the right to share ${them}, and anyone identifiable in ${them} has agreed. EventLinqs may use ${them} to promote ${night} and our future events on EventLinqs, in its social posts and in its emails, resized, cropped or placed inside EventLinqs designs. Not paid advertising, and never sold (declaration of ${DECLARATION_VERSION}).`
}

/**
 * WHAT AN ORGANISER'S IMAGE MAY NOT HAVE DONE TO IT, the register's restrictions (Lawal, 13:49 of 23 November 2026: no
 * invented restriction). A photograph carries none: it may be resized, cropped or placed inside an EventLinqs design, as
 * the one tick says. Only their finished design (a flyer or poster, the register's 'artwork') is kept whole, because
 * cropping it would cut their own words and layout. Pure.
 */
export const POSTER_KEPT_WHOLE = "Kept whole: the organiser's own finished design, shown as they made it, never cropped or changed."
export function restrictionFor(assetType: 'photo' | 'artwork'): string | null {
  return assetType === 'artwork' ? POSTER_KEPT_WHOLE : null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * THE NIGHT THE LETTER NAMES, PRESELECTED (the PM's 13:50 of 18 November 2026, item 1 (d)). The Event Photo Permissions
 * letter's subject is fixed: "Helping more people find <night> on <day> <month>" (comms-gateway standard.json,
 * offer_subjects). The night whose title is that title, on that day in its own time zone, opens already chosen; a title
 * alone chooses only when exactly one of their nights carries it. Null when the subject names none of their nights.
 */
export function nightNamedBy(
  subject: string | null,
  nights: readonly { readonly eventId: string; readonly title: string; readonly startDate: string; readonly timezone: string | null }[],
): string | null {
  const m = /^Helping more people find (.+) on (\d{1,2}) ([A-Z][a-z]+)$/.exec((subject ?? '').trim())
  if (!m || !MONTHS.includes(m[3])) return null
  const title = m[1].trim().toLowerCase()
  const same = nights.filter((n) => n.title.trim().toLowerCase() === title)
  const onDay = same.filter((n) => {
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: n.timezone ?? 'Australia/Melbourne', day: 'numeric', month: 'long' }).formatToParts(new Date(n.startDate))
    return Number(parts.find((p) => p.type === 'day')?.value) === Number(m[2]) && parts.find((p) => p.type === 'month')?.value === m[3]
  })
  if (onDay.length > 0) return onDay[0].eventId
  return same.length === 1 ? same[0].eventId : null
}
