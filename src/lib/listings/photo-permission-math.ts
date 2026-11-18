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

/** Their yes, as the page put it to them and as they gave it. */
export function grantWording(input: { readonly givenBy: string; readonly organiserName: string; readonly nightTitle: string; readonly uses: PhotoUses; readonly count: number }): string {
  const images = input.count === 1 ? 'the image' : `the ${input.count} images`
  return `${input.givenBy.trim()}, for ${input.organiserName.trim()}: I took ${images} I added for ${input.nightTitle.trim()}, or have the right to share ${input.count === 1 ? 'it' : 'them'}, and EventLinqs may use ${input.count === 1 ? 'it' : 'them'} ${USE_WORDS[input.uses]}.`
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
