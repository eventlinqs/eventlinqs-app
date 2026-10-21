import { localDayOfWeek } from '@/lib/events/listing-window'

/**
 * EVERY LINE EVENTLINQS WRITES ON A WALK-IN PAGE (WI1, locked design A).
 *
 * Lawal's ruling of 21 October 2026: on a walk-in page no line EventLinqs
 * writes says "ticket" or "book", except "No ticket needed", and none carries a
 * dollar sign. Text the organiser supplies shows as written. Keeping the
 * platform's own words here, beside the four allowed phrases in
 * src/lib/events/entry-mode.ts, puts them where
 * scripts/guards/walk-in-page-sells-nothing.mjs reads them.
 *
 * A leaf, no imports: the page and the client controls read one copy.
 */

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** "three" for 3, the digits from eleven, as design A writes "All three days". */
export function countWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n)
}

/** Under "No ticket needed" in the panel: "Entry is free on all three days. Just come along." */
export function entryLine(dayCount: number): string {
  return dayCount > 1
    ? `Entry is free on all ${countWord(dayCount)} days. Just come along.`
    : 'Entry is free. Just come along.'
}

// A guide day is a calendar date already in the event's own zone ("2026-10-24"),
// so its weekday is the same wherever it is read: noon UTC on that date names
// it, and the shared helper does the counting (one-weekend-definition).
const WEEKDAY = (iso: string) => localDayOfWeek(new Date(`${iso}T12:00:00Z`), 'UTC')

/**
 * The program heading. Design A's "The weekend, day by day" is used only when
 * the days are a real weekend run (Friday to Sunday, or Saturday to Sunday);
 * any other run of days is "Day by day", and a single day is "The program".
 */
export function programHeading(dates: string[]): string {
  if (dates.length <= 1) return 'The program'
  const first = WEEKDAY(dates[0])
  const last = WEEKDAY(dates[dates.length - 1])
  const weekend = last === 0 && ((first === 5 && dates.length === 3) || (first === 6 && dates.length === 2))
  return weekend ? 'The weekend, day by day' : 'Day by day'
}

/** The highlights heading: "All three days" over several days, "Highlights" over one. */
export function highlightsHeading(dayCount: number): string {
  return dayCount > 1 ? `All ${countWord(dayCount)} days` : 'Highlights'
}

export const PLAN_YOUR_VISIT = 'Plan your visit'
export const CLOSING_THE_NIGHT = 'Closing the night'
export const FROM_PAST_EVENTS = 'Photos'
export const ABOUT_THIS_EVENT = 'About this event'
export const GETTING_THERE_AND_ACCESS = 'Getting there and access'
export const ACCESS = 'Access'
export const GET_DIRECTIONS = 'Get directions'
export const ORGANISED_BY = 'Organised by'
export const REMIND_ME = 'Remind me'
export const SHARE = 'Share'
export const YOUR_EMAIL = 'Your email'
export const BOTTOM_BAR_SUBLINE_PROGRAM = 'Program sent when it lands'
export const BOTTOM_BAR_SUBLINE_REMINDER = 'A reminder the day before'

/** "Fri 20" in the panel and on a phone tab; "Fri 20 Nov" on a desktop tab; "Friday 20 November" over a day. */
export function dayLabels(iso: string): { short: string; tab: string; long: string } {
  const d = new Date(`${iso}T12:00:00Z`)
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...o }).format(d)
  const weekdayShort = fmt({ weekday: 'short' })
  const day = fmt({ day: 'numeric' })
  return {
    short: `${weekdayShort} ${day}`,
    tab: `${weekdayShort} ${day} ${fmt({ month: 'short' })}`,
    long: `${fmt({ weekday: 'long' })} ${day} ${fmt({ month: 'long' })}`,
  }
}

/** The dates chip: "Fri 20 to Sun 22 Nov 2026", or one day "Fri 20 Nov 2026". */
export function datesChip(dates: string[]): string {
  if (dates.length === 0) return ''
  const first = dayLabels(dates[0])
  const lastIso = dates[dates.length - 1]
  const year = lastIso.slice(0, 4)
  if (dates.length === 1) return `${first.tab} ${year}`
  return `${first.short} to ${dayLabels(lastIso).tab} ${year}`
}
