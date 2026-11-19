/**
 * THE WORDS OF AN ORGANISER'S PHOTO PERMISSION (./photo-permission.ts). Their yes is kept in the words the page showed
 * them, with who gave it and for which night, so the register's evidence reads as what they agreed to. Pure.
 */

/** Where EventLinqs may use the images: that night's own page and cards, its social posts about the night, or both. */
export type PhotoUses = 'site' | 'social' | 'both'

/** The page's two boxes as the register's scope; neither ticked is no permission at all. */
export function usesFrom(onPage: boolean, inPosts: boolean): PhotoUses | null {
  if (onPage && inPosts) return 'both'
  if (onPage) return 'site'
  if (inPosts) return 'social'
  return null
}

const USE_WORDS: Record<PhotoUses, string> = {
  site: "on this night's own page and cards on EventLinqs",
  social: "in EventLinqs' social posts about this night",
  both: "on this night's own page and cards on EventLinqs and in EventLinqs' social posts about it",
}

/** The register's permitted uses, in plain words. */
export function permittedUsesWords(uses: PhotoUses): string {
  return `${USE_WORDS[uses].charAt(0).toUpperCase()}${USE_WORDS[uses].slice(1)}, as the organiser chose on their EventLinqs photo page; this night only, not paid advertising.`
}

/**
 * THE ORGANISER MEDIA DECLARATION, version of 19 November 2026 (law 32, the PM's 13:30, on Lawal's 13:20): the organiser
 * confirms they own the images or hold the rights EventLinqs needs, INCLUDING the agreement of anyone identifiable in
 * them, for the uses they tick and that night only. A yes given before this date keeps the words it was given in.
 */
export const DECLARATION_VERSION = '19 November 2026'

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

/** Their yes, as the page put it to them and as they gave it. */
export function grantWording(input: { readonly givenBy: string; readonly organiserName: string; readonly nightTitle: string; readonly uses: PhotoUses; readonly count: number }): string {
  const images = input.count === 1 ? 'the image' : `the ${input.count} images`
  return `${input.givenBy.trim()}, for ${input.organiserName.trim()}: I took ${images} I added for ${input.nightTitle.trim()}, or have the right to share ${input.count === 1 ? 'it' : 'them'}, anyone identifiable in ${input.count === 1 ? 'it' : 'them'} has agreed, and EventLinqs may use ${input.count === 1 ? 'it' : 'them'} ${USE_WORDS[input.uses]} (declaration of ${DECLARATION_VERSION}).`
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
