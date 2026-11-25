import { PROVIDER_NAMES, type BookingProvider } from '@/lib/events/booking-links'
import { ownHost, onOwnHost } from './own-host'

/**
 * MESSAGE 8, THE RESULTS NOTE AFTER A NIGHT (law 49: "T+1 to T+3, RET: a results note (views, clicks, tickets sold through
 * EventLinqs, law 39) and the invite to list their next event natively", EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md section 2;
 * after_your_night version 2, activated by the PM's 12:11 of 25 November 2026, item 1: version 1 with its untrue lines
 * removed, partners only, figures only when read).
 *
 * When: from the day after the night ended to three days after, counted in the night's own calendar days (the event
 * clock's 'results' stage); never later (law 42: a missed day is never caught up).
 */
export const AFTER_YOUR_NIGHT_DUE_DAYS = 1
/** The last day it may go: T+3. */
export const AFTER_YOUR_NIGHT_LAST_DAY = 3
/** From this many days after the night it is too late (T+4), the report query's own edge. */
export const AFTER_YOUR_NIGHT_STALE_DAYS = 4

const dayOf = (at: Date, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Why message 8 is not due for a night that ended at endedAt, or null when it is (T+1 to T+3, in its zone). Pure. */
export function afterYourNightRefusal(endedAt: Date, now: Date, zone = 'Australia/Melbourne'): string | null {
  const days = daysBetween(dayOf(endedAt, zone), dayOf(now, zone))
  if (days < AFTER_YOUR_NIGHT_DUE_DAYS) return 'not before the day after the night (law 49: T+1)'
  if (days > AFTER_YOUR_NIGHT_LAST_DAY) return `the night ended ${days} days ago, too late to report (law 49: T+1 to T+3)`
  return null
}

/** A night report's figures as message 8 reads them (src/lib/growth/organiser-report-math.ts NightFigures). */
type Figures = {
  readonly viewers?: unknown
  readonly pressesOut?: { readonly people?: unknown; readonly bySite?: readonly { readonly provider?: unknown; readonly people?: unknown }[] }
  readonly onEventLinqs?: { readonly tickets?: unknown } | null
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0)

/** Where most of its presses out went, named as people know it; 'its booking page' when the seller is not one we name. Pure. */
export function sellerWords(figures: unknown): string {
  const f = (figures && typeof figures === 'object' ? figures : {}) as Figures
  const top = [...(f.pressesOut?.bySite ?? [])].sort((a, b) => count(b.people) - count(a.people))[0]
  const name = top && typeof top.provider === 'string' ? (PROVIDER_NAMES as Record<string, string | null>)[top.provider as BookingProvider] : null
  return name ?? 'its booking page'
}

/**
 * The results the note carries, from figures that were read, each only above zero: "41 people viewed its listing, and 9
 * clicked through to Gotix for tickets." then, only when tickets were bought on EventLinqs, "3 tickets were bought on
 * EventLinqs.", then, only when their next night is listed and ahead, "Your next one, <title> on <day>, is listed too:
 * <link>". A click is never called a sale. Null when nothing above zero was counted: there is nothing to report, so no
 * note is drafted. Pure.
 */
export function afterYourNightResults(figures: unknown, next: { readonly title: string; readonly day: string; readonly link: string } | null): string | null {
  const f = (figures && typeof figures === 'object' ? figures : {}) as Figures
  const views = count(f.viewers)
  const clicks = count(f.pressesOut?.people)
  const tickets = count(f.onEventLinqs?.tickets)
  const parts = [
    views > 0 ? `${views} ${views === 1 ? 'person' : 'people'} viewed its listing` : null,
    clicks > 0 ? `${clicks} clicked through to ${sellerWords(figures)} for tickets` : null,
  ].filter((x): x is string => x !== null)
  if (parts.length === 0 && tickets === 0) return null
  const lines: string[] = []
  if (parts.length > 0) lines.push(`${parts.join(', and ')}.`)
  if (tickets > 0) lines.push(`${tickets} ${tickets === 1 ? 'ticket was' : 'tickets were'} bought on EventLinqs.`)
  const out = lines.join(' ')
  return next ? `${out}\n\nYour next one, ${next.title} on ${next.day}, is listed too: ${next.link}` : out
}

/**
 * The partner a night was theirs, by the three roads ./their-nights.ts reads an organiser's nights by: a venue they run,
 * their own organisation, or a booking page on their own website's host; the first partner found, or null. Pure.
 */
export function nightPartner(
  night: { readonly venueOwners: readonly string[]; readonly organisationId: string | null; readonly bookingPages: readonly string[] },
  partners: readonly { readonly id: string; readonly organisationId: string | null; readonly websiteUrl: string | null }[],
): string | null {
  for (const p of partners) {
    if (night.venueOwners.includes(p.id)) return p.id
    if (night.organisationId !== null && p.organisationId === night.organisationId) return p.id
    const host = ownHost(p.websiteUrl)
    if (host && night.bookingPages.some((u) => onOwnHost(u, host))) return p.id
  }
  return null
}
