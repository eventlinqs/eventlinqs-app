import { z } from 'zod'
import { spanDates } from './dates'

// One definition of each, in a leaf the client form can import without zod.
export { localDate, spanDates } from './dates'

/**
 * THE GUIDE BEHIND A WALK-IN EVENT PAGE (WI1, locked design A).
 *
 * One module owns the shape of `public.event_guides`. The database holds the
 * outer shape and the bounds (migration 20261021000020); this file holds the
 * inner shape, and every write and every read goes through `parseGuide`, so a
 * row the page was never drawn to show can neither be stored nor rendered.
 *
 * WHAT A DAY IS. The organiser lists the days of the event and gives each one
 * its hours. Nothing here derives the days from the start and end times on its
 * own, because a calendar cannot tell a festival weekend from a bar night that
 * runs 9pm to 2am: both cross midnight, and only the second is one night. So the
 * organiser decides, and the publish gate checks what they decided against the
 * event's own dates (`walkInHoursProblems`).
 */

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const text = (max: number) => z.string().trim().min(1).max(max)

export const GuideItemSchema = z.object({
  /** The time label on the left of a program row: "10am", "All day", "Opening". */
  when: text(40),
  what: text(200),
})

export const GuideCloserSchema = z.object({
  name: text(80),
  note: z.string().trim().max(120).nullable().default(null),
})

export const GuideDaySchema = z.object({
  date: z.string().regex(ISO_DATE),
  /** "HH:MM" in the event's own zone, or null when the opening is not confirmed. */
  opens: z.string().regex(CLOCK).nullable(),
  /**
   * "HH:MM". Earlier than `opens` means the night runs past midnight. Null when
   * the source gives no finish (WI2, the 21 October 22:25 answer 1): the page
   * says "From" the opening and never makes an end up. The organiser form still
   * asks for one.
   */
  closes: z.string().regex(CLOCK).nullable(),
  /** The organiser's own words for hours that are not confirmed yet. */
  hours_label: z.string().trim().max(60).nullable().default(null),
  items: z.array(GuideItemSchema).max(20).default([]),
  closer: GuideCloserSchema.nullable().default(null),
})

export const GuideGlanceSchema = z.object({ value: text(24), label: text(60) })
export const GuideHighlightSchema = z.object({ title: text(60), body: text(300) })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => (v && v.length > 0 ? v : null))

export const GuideSchema = z.object({
  days: z.array(GuideDaySchema).max(31).default([]),
  at_a_glance: z.array(GuideGlanceSchema).max(4).default([]),
  highlights: z.array(GuideHighlightSchema).max(6).default([]),
  highlights_note: optionalText(600),
  program_note: optionalText(600),
  quote_text: optionalText(600),
  quote_attribution: optionalText(120),
  getting_there: optionalText(800),
  access_notes: optionalText(800),
  /** The organiser's own heading over the photos ("From past festivals"). */
  photos_heading: optionalText(60),
  /** The credit on the cover photo ("AMCF, past festival"). */
  cover_credit: optionalText(120),
  /** The credit under the photos (the organiser's own name, as they credit it). */
  photo_credit: optionalText(120),
  program_published_at: z.string().nullable().default(null),
})

export type GuideItem = z.infer<typeof GuideItemSchema>
export type GuideDay = z.infer<typeof GuideDaySchema>
export type Guide = z.infer<typeof GuideSchema>

export type ParsedGuide = { ok: true; guide: Guide } | { ok: false; problems: string[] }

/** Parse a guide row or a form payload. Unknown keys are dropped, never stored. */
export function parseGuide(input: unknown): ParsedGuide {
  const result = GuideSchema.safeParse(input ?? {})
  if (result.success) return { ok: true, guide: result.data }
  return {
    ok: false,
    problems: result.error.issues.map((i) => `${i.path.join('.') || 'guide'}: ${i.message}`),
  }
}

/** The empty guide: what a walk-in page shows before the organiser adds anything. */
export const EMPTY_GUIDE: Guide = GuideSchema.parse({})

/**
 * "22:00" as design A writes it: "10pm". "22:30" is "10:30pm", "00:00" is
 * "12am" and "12:00" is "12pm".
 */
export function formatClock(hhmm: string): string {
  const m = CLOCK.exec(hhmm)
  if (!m) return hhmm
  const [h, min] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, '0')}${suffix}`
}

/**
 * One day's hours as the page shows them. The opening is either a confirmed
 * clock time or the organiser's own "to confirm" words, which the page sets in
 * the highlight design A draws for an unconfirmed time.
 */
export type DayHours = { opens: string | null; unconfirmed: string | null; closes: string | null }

export function dayHours(day: GuideDay): DayHours {
  return {
    opens: day.opens ? formatClock(day.opens) : null,
    unconfirmed: day.opens ? null : day.hours_label,
    closes: day.closes ? formatClock(day.closes) : null,
  }
}

/**
 * What stops a walk-in event being published, about its hours. Empty means the
 * hours are publishable. Each entry is a sentence for the organiser.
 */
export function walkInHoursProblems(
  days: GuideDay[],
  event: { startsAt: string; endsAt: string; timezone: string },
): string[] {
  if (days.length === 0) {
    return ['Add the hours for each day before publishing, so people know when to come.']
  }
  const span = spanDates(event.startsAt, event.endsAt, event.timezone)
  const problems: string[] = []
  const seen = new Set<string>()
  for (const day of days) {
    if (seen.has(day.date)) problems.push(`${day.date} is listed twice. List each day once.`)
    seen.add(day.date)
    if (!span.includes(day.date)) {
      problems.push(`${day.date} is outside the event's dates. Check the dates in step 2, or remove that day.`)
    }
    if (!day.opens && !day.hours_label) {
      problems.push(`${day.date} has no opening time. Add one, or say it is still to confirm.`)
    }
  }
  const dates = days.map((d) => d.date)
  if (dates.some((d, i) => i > 0 && d < dates[i - 1])) {
    problems.push('List the days in date order.')
  }
  if (span.length > 0 && days[0]?.date !== span[0]) {
    problems.push(`The first day listed must be the day the event starts, ${span[0]}.`)
  }
  return problems
}
