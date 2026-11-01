/**
 * THE VISITOR SENTINEL'S JUDGE (the controller's 16:43 of 1 November 2026; Lawal: the faults a visitor meets must never
 * need a founder's eye). Pure: given a public page's HTML, the database's facts about every night it links, the page's
 * city and the time, it says what a visitor would meet that is untrue. The runner (visitor-sentinel-run.ts) fetches the
 * pages and the facts; the cron (src/app/api/cron/visitor-sentinel) alarms through the health router.
 *
 * Judged here: an ended night (by the night's own zone, the platform's one listing rule), a night of another city on a
 * city page, a night whose every booking link the link check found dead, and a placeholder cover drawn where a
 * photograph belongs. NOT judged here, said plainly: whether a printed count equals the rows shown and whether a section
 * paints blank need a rendered page, which this read of the HTML cannot see.
 */
import { isStillListed } from '@/lib/events/listing-window'
import type { HealthResult } from './result'

export type PageEventFacts = {
  slug: string
  citySlug: string | null
  startDate: string
  endDate: string | null
  timezone: string | null
  status: string
  deadBookingLinks: number
  liveBookingLinks: number
}

/** The routes a visit COUNTS (an outbound click, a share, a go link): the sentinel never follows them. */
const COUNTED = /^\/(out|e|s|go)(\/|$)/

/** The internal links on a page (counted routes left out) and the event pages among them, each once, in page order. */
export function linksOnPage(html: string): { internal: string[]; events: string[] } {
  const internal: string[] = []
  const events: string[] = []
  for (const m of html.matchAll(/href="([^"#?]+)[^"]*"/g)) {
    const href = m[1]
    if (!href.startsWith('/') || href.startsWith('//') || COUNTED.test(href)) continue
    if (!internal.includes(href)) internal.push(href)
    const e = /^\/events\/([a-z0-9-]+)$/.exec(href)
    if (e && !events.includes(e[1])) events.push(e[1])
  }
  return { internal, events }
}

const PLACEHOLDER_IMAGE = /\/generated-covers\//

export function judgeVisitorPage(input: {
  path: string
  /** The page's city, or null for a page that is not one city's (the home page). */
  citySlug: string | null
  html: string
  facts: readonly PageEventFacts[]
  now: Date
}): HealthResult[] {
  const { path, citySlug, html, facts, now } = input
  const shown = new Set(linksOnPage(html).events)
  const onPage = facts.filter((f) => shown.has(f.slug))
  const result = (id: string, label: string, bad: string[], why: string, action: string): HealthResult => ({
    id: `${id}:${path}`,
    label: `${label} (${path})`,
    severity: 'critical',
    ok: bad.length === 0,
    detail: bad.length === 0 ? 'none' : `${bad.length}: ${bad.slice(0, 12).join(', ')}${bad.length > 12 ? ' and more' : ''}`,
    probableCause: bad.length === 0 ? undefined : why,
    action: bad.length === 0 ? undefined : action,
  })

  const ended = onPage.filter((f) => !isStillListed({ start_date: f.startDate, end_date: f.endDate, timezone: f.timezone }, now)).map((f) => f.slug)
  const otherCity = citySlug === null ? [] : onPage.filter((f) => f.citySlug !== null && f.citySlug !== citySlug).map((f) => `${f.slug} (${f.citySlug})`)
  const deadBooking = onPage.filter((f) => f.deadBookingLinks > 0 && f.liveBookingLinks === 0).map((f) => f.slug)
  const placeholders = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((src) => PLACEHOLDER_IMAGE.test(src))

  return [
    result('visitor-ended', 'Ended nights shown', ended, 'a public list read a night past its end', 'The night must leave every public list at its end in its own zone; find the list that skipped the listing rule.'),
    result('visitor-other-city', 'Nights of another city', otherCity, 'a city page listed a night placed in another city', 'A city page shows its own city only; check the city rule the page reads.'),
    result('visitor-dead-booking', 'Nights with no working booking link', deadBooking, 'every booking link the night carries answered 404 or 410', 'Re-check the night at its source; take it down or give it its new booking link.'),
    result('visitor-placeholder', 'Placeholder covers drawn as photographs', placeholders, 'a generated cover is drawn where a photograph belongs', 'A night without a rights recorded photograph is a directory row, never a drawn cover (law 7).'),
  ]
}
