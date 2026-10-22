import { ALLOWED_TICKET_PHRASES } from '@/lib/events/entry-mode'

/**
 * THE WORDS EVENTLINQS WRITES ON A WALK-IN LISTING (WI1, Lawal's rulings 2 and
 * 3 of 21 October 2026).
 *
 * "Only words EventLinqs writes are banned. That includes the one-line
 * description we write for an unclaimed listing from public information
 * (listing_source = 'eventlinqs'). Text the organiser supplies shows as
 * written." And: "No line EventLinqs writes carries a dollar sign."
 *
 * So this judges a listing only when EventLinqs wrote it. Nothing here ever
 * refuses an organiser's own words, a price of something on the day included:
 * "Food stalls from $10" and "Bookings open through AMCF" stay as written.
 *
 * The event's TITLE is not judged. It is the event's own name, taken as it is
 * ("Silent Book Club" is a real weekly free night), and the page shows it as the
 * event's words.
 *
 * The same rule as the page guard's text judge
 * (scripts/guards/walk-in-page-sells-nothing.mjs, judgeText), which judges the
 * platform's own copy at build time; this judges a listing's copy at save time.
 * WI2's import calls it for every row it writes.
 */

export type ListingText = {
  summary?: string | null
  description?: string | null
  guide?: {
    days?: Array<{
      hours_label?: string | null
      items?: Array<{ when?: string | null; what?: string | null }>
      closer?: { name?: string | null; note?: string | null } | null
    }>
    at_a_glance?: Array<{ value?: string | null; label?: string | null }>
    highlights?: Array<{ title?: string | null; body?: string | null }>
    highlights_note?: string | null
    program_note?: string | null
    quote_text?: string | null
    quote_attribution?: string | null
    getting_there?: string | null
    access_notes?: string | null
    photos_heading?: string | null
    cover_credit?: string | null
    photo_credit?: string | null
  } | null
}

/** What is wrong with one line EventLinqs wrote, or []. */
export function lineProblems(text: string): string[] {
  let rest = text
  for (const phrase of ALLOWED_TICKET_PHRASES) rest = rest.split(phrase).join(' ')
  const problems: string[] = []
  if (/\btickets?\b|\bticketed\b/i.test(rest)) problems.push('the word "ticket"')
  if (/\bbook(s|ed|ing|ings)?\b/i.test(rest)) problems.push('a "book" word')
  if (text.includes('$')) problems.push('a dollar sign')
  return problems
}

/** Every line of a listing, labelled the way the organiser form names it. */
function linesOf(listing: ListingText): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const add = (label: string, value: string | null | undefined) => {
    if (typeof value === 'string' && value.trim()) out.push([label, value])
  }
  add('the one-line summary', listing.summary)
  add('the description', listing.description)
  const g = listing.guide
  if (!g) return out
  ;(g.days ?? []).forEach((d, i) => {
    add(`day ${i + 1}'s hours wording`, d.hours_label)
    ;(d.items ?? []).forEach((item, j) => {
      add(`day ${i + 1}, program item ${j + 1}`, item.when)
      add(`day ${i + 1}, program item ${j + 1}`, item.what)
    })
    add(`day ${i + 1}'s closing act`, d.closer?.name)
    add(`day ${i + 1}'s closing act`, d.closer?.note)
  })
  ;(g.at_a_glance ?? []).forEach((x, i) => {
    add(`at a glance ${i + 1}`, x.value)
    add(`at a glance ${i + 1}`, x.label)
  })
  ;(g.highlights ?? []).forEach((x, i) => {
    add(`highlight ${i + 1}`, x.title)
    add(`highlight ${i + 1}`, x.body)
  })
  add('the line under the highlights', g.highlights_note)
  add('the note under the program', g.program_note)
  add('the quote', g.quote_text)
  add('who said the quote', g.quote_attribution)
  add('getting there', g.getting_there)
  add('access', g.access_notes)
  add('the heading over the photos', g.photos_heading)
  add('the cover photo credit', g.cover_credit)
  add('the photo credit', g.photo_credit)
  return out
}

/**
 * Sentences saying what stops a listing EventLinqs wrote from being saved, or
 * [] when it may be. Called only for listing_source = 'eventlinqs'.
 */
export function eventlinqsListingProblems(listing: ListingText): string[] {
  const problems: string[] = []
  for (const [label, text] of linesOf(listing)) {
    const found = lineProblems(text)
    if (found.length > 0) {
      problems.push(
        `${label[0].toUpperCase()}${label.slice(1)} carries ${found.join(' and ')}. A free walk-in listing EventLinqs writes says no "ticket" or "book" word but "No ticket needed", and no dollar sign. Reword it.`,
      )
    }
  }
  return problems
}
