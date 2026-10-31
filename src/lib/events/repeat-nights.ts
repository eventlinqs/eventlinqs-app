import { toZonedInputValue, resolveZone } from '@/lib/dates/event-time'
import { nextOccurrences, type SeriesRule } from '@/lib/listings/occurrences'

/**
 * A REPEAT MAKES ITS NIGHTS (V3 item 6, 'recurring nights in one step'). The organiser form has offered "This is a
 * recurring event" since the baseline schema and stored the choice, and nothing ever made a second night from it. This
 * says which nights a repeating event needs; the writer (repeat-nights-write.ts) makes each one a real event of its own,
 * with the same details and ticket types, through the same publish gate.
 *
 * The dates come from the listings' own engine (src/lib/listings/occurrences.ts): calendar dates first, each turned
 * into an instant in the event's zone, so a weekly 7pm night stays at 7pm local across a Daylight Saving change. Eight
 * nights in all, the template and the next seven, which is the horizon the weekly listings keep. A night that already
 * exists for a date is never made twice.
 */
export const REPEAT_NIGHTS_AHEAD = 7

/** What the form stores. The FREQ= values are what it stored before 1 November 2026, read the same way. */
export const REPEAT_CHOICES = [
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every fortnight' },
  { value: 'monthly', label: 'Same weekday each month' },
] as const

const DAY_MS = 24 * 60 * 60 * 1000

/** The listings rule a stored choice means for a night on this local date, or why it cannot repeat. */
export function repeatRuleOf(stored: string | null, localDate: string): { rule: SeriesRule } | { problem: string } {
  const choice = (stored ?? '').trim()
  if (choice === 'weekly' || choice === 'FREQ=WEEKLY') return { rule: 'weekly' }
  if (choice === 'fortnightly') return { rule: 'fortnightly' }
  if (choice === 'monthly' || choice === 'FREQ=MONTHLY') {
    const nth = Math.ceil(Number(localDate.slice(8, 10)) / 7)
    // Not every month has a fifth of a weekday, so a fifth repeats as the last of its weekday.
    return { rule: nth >= 5 ? 'monthly-last' : (`monthly-${nth}` as SeriesRule) }
  }
  if (choice === 'FREQ=DAILY') return { problem: 'A night cannot repeat every day. Choose every week, every fortnight or the same weekday each month.' }
  return { problem: 'Choose how often this night repeats: every week, every fortnight or the same weekday each month.' }
}

export type RepeatTemplate = {
  readonly start_date: string
  readonly end_date: string
  readonly timezone: string | null
  readonly recurrence_rule: string | null
}

export type RepeatNight = { readonly date: string; readonly startIso: string; readonly endIso: string }

/**
 * The template's next REPEAT_NIGHTS_AHEAD dates after its own, less those that already have a night. A night longer
 * than a day does not repeat this way: its dates would overlap, so each is made as its own event.
 */
export function planRepeatNights(
  template: RepeatTemplate,
  existingDates: readonly string[],
  now: Date,
): { nights: RepeatNight[] } | { problem: string } {
  const zone = resolveZone(template.timezone)
  const startLocal = toZonedInputValue(template.start_date, zone)
  const endLocal = toZonedInputValue(template.end_date, zone)
  if (!startLocal || !endLocal) return { problem: 'This night has no start or finish to repeat from.' }
  const length = Date.parse(template.end_date) - Date.parse(template.start_date)
  if (!(length > 0)) return { problem: 'This night finishes before it starts, so it cannot repeat.' }
  if (length >= DAY_MS) return { problem: 'A night longer than a day cannot repeat: make each date as its own event.' }

  const date = startLocal.slice(0, 10)
  const ruled = repeatRuleOf(template.recurrence_rule, date)
  if ('problem' in ruled) return ruled

  const after = new Date(Math.max(now.getTime(), Date.parse(template.start_date) + 1))
  const have = new Set(existingDates)
  const nights = nextOccurrences(
    { rule: ruled.rule, anchorDate: date, startsAt: startLocal.slice(11, 16), endsAt: endLocal.slice(11, 16), timezone: zone },
    after,
    REPEAT_NIGHTS_AHEAD,
  )
    .filter((o) => !have.has(o.date))
    .map((o) => ({ date: o.date, startIso: o.startIso, endIso: o.endIso! }))
  return { nights }
}
