import { fromZonedInputValue } from '@/lib/dates/event-time'
import { venueSlugify } from '@/lib/venues/venue-slug'
import { addDays, nextOccurrences, occurrenceOn, type Series } from './occurrences'

/**
 * WHICH DATED EVENTS A NIGHT NEEDS (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 7).
 *
 * Pure: given one series and the occurrence events it already has, it says
 * which to make, which to bring in line with the series, and which to take off,
 * and the daily run (and the import, after it writes) does exactly that. Every
 * occurrence is an ordinary walk-in event; the writer adds what is the same for
 * all of them (walk-in entry, in person, the venue, published through the WI1
 * publish gate), and this module owns what comes from the night itself.
 *
 * THE RULES IT HOLDS.
 * - An active night always has an event for each of its next 8 dates.
 * - An occurrence that has started is never touched again: not changed, not
 *   cancelled, not deleted.
 * - A future occurrence that is still one of the night's dates is brought in
 *   line with the night when the night changes (its time, its words, its
 *   category, its age limit).
 * - A future occurrence that is no longer one of its dates (a skipped date, a
 *   changed rule, a paused or removed night) comes off through the lifecycle
 *   law (docs/EVENT-LIFECYCLE.md): CANCELLED when anyone asked to be reminded
 *   of it, so they are told, DELETED when nobody did.
 * - A night with no finish (the 21 October 22:25 answer 1) shows "From 6:30pm"
 *   and never a made up end: its guide day has no closing time, and the event
 *   row, which must end after it starts, ends at the close of its own day in
 *   the night's zone, for its state only, never shown.
 * - A cancelled occurrence keeps its date for good (a cancelled event never
 *   goes back to published), so a date that comes back after being cancelled
 *   is HELD and named, never written over.
 */

export const OCCURRENCES_AHEAD = 8

export type NightForOccurrences = Series & {
  status: 'active' | 'paused' | 'removed'
  name: string
  summary: string
  categoryId: string
  ageRestrictionMin: number | null
}

export type ExistingOccurrence = {
  id: string
  /** The local date it falls on, "YYYY-MM-DD". */
  occurrenceDate: string
  status: string
  title: string
  summary: string | null
  startIso: string
  endIso: string
  timezone: string
  categoryId: string | null
  ageRestrictionMin: number | null
  /** The guide day's hours, "HH:MM"; null when it has no guide day, or (closes) no finish. */
  opens: string | null
  closes: string | null
  /** People who asked to be reminded of it. */
  reminderCount: number
}

/** What an occurrence takes from its night, in the events table's column names. */
export type OccurrenceFields = {
  title: string
  summary: string
  start_date: string
  end_date: string
  timezone: string
  category_id: string
  is_age_restricted: boolean
  age_restriction_min: number | null
}

/** The one guide day a walk-in occurrence carries (src/lib/walk-in/guide.ts). */
export type OccurrenceGuideDay = {
  date: string
  opens: string
  /** Null when the night has no finish: the page says "From" the opening. */
  closes: string | null
  hours_label: null
  items: []
  closer: null
}

export type OccurrencePlan = {
  create: Array<{ date: string; fields: OccurrenceFields; guideDay: OccurrenceGuideDay }>
  update: Array<{ id: string; date: string; changes: Partial<OccurrenceFields>; guideDay: OccurrenceGuideDay | null }>
  retire: Array<{ id: string; date: string; action: 'cancel' | 'delete'; why: string }>
  held: Array<{ date: string; why: string }>
  /** Occurrences already as they should be, or past and left alone. */
  unchanged: number
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b)

/**
 * An occurrence's address: the night, the host and the date, read as words
 * ("corner-hall-trivia-the-corner-hall-2026-10-28"), for the clean URLs the
 * SEO engine asks for. Never a random suffix: the same night on the same date
 * always has the same address, and two hosts' nights of one name never meet.
 * The host part is left out when the night's name already carries it.
 */
export function occurrenceSlug(nightName: string, hostSlug: string, date: string): string {
  const night = venueSlugify(nightName).slice(0, 60).replace(/-+$/, '')
  const host = hostSlug.slice(0, 40).replace(/-+$/, '')
  const parts = night.includes(host) || host === '' ? [night, date] : [night, host, date]
  return parts.filter(Boolean).join('-')
}

function fieldsFor(night: NightForOccurrences, date: string): { fields: OccurrenceFields; guideDay: OccurrenceGuideDay } {
  const at = occurrenceOn(night, date)
  // No finish given: the row ends at the close of its own day, for its state only.
  const endIso = at.endIso ?? fromZonedInputValue(`${addDays(date, 1)}T00:00`, night.timezone)
  const age = night.ageRestrictionMin
  return {
    fields: {
      title: night.name,
      summary: night.summary,
      start_date: at.startIso,
      end_date: endIso,
      timezone: night.timezone,
      category_id: night.categoryId,
      is_age_restricted: age !== null && age > 0,
      age_restriction_min: age,
    },
    guideDay: { date, opens: night.startsAt, closes: night.endsAt, hours_label: null, items: [], closer: null },
  }
}

export function planOccurrences(
  night: NightForOccurrences,
  existing: readonly ExistingOccurrence[],
  now: Date,
  ahead = OCCURRENCES_AHEAD,
): OccurrencePlan {
  const plan: OccurrencePlan = { create: [], update: [], retire: [], held: [], unchanged: 0 }
  const future = existing.filter((o) => Date.parse(o.startIso) > now.getTime())
  plan.unchanged += existing.length - future.length

  // The dates the night wants: its next `ahead`, and, so a row made when a
  // skip pushed the window out is not taken off when the skip goes, every rule
  // date up to the furthest occurrence it already has.
  let valid = new Set<string>()
  const wanted: string[] = []
  if (night.status === 'active') {
    const furthest = future.reduce((m, o) => (o.occurrenceDate > m ? o.occurrenceDate : m), '')
    const horizon = nextOccurrences(night, now, Math.max(ahead, 60)).map((o) => o.date)
    wanted.push(...horizon.slice(0, ahead))
    const last = wanted[wanted.length - 1] ?? ''
    valid = new Set(horizon.filter((d) => d <= (furthest > last ? furthest : last)))
  }

  const byDate = new Map(future.map((o) => [o.occurrenceDate, o]))
  for (const date of wanted) {
    if (byDate.has(date)) continue
    // Nothing future holds the date, but a past or cancelled row may still own it.
    const owner = existing.find((o) => o.occurrenceDate === date)
    if (owner) {
      plan.held.push({ date, why: `an occurrence already holds ${date} (${owner.status})` })
      continue
    }
    plan.create.push({ date, ...fieldsFor(night, date) })
  }

  for (const o of future) {
    if (o.status === 'cancelled') {
      if (valid.has(o.occurrenceDate)) plan.held.push({ date: o.occurrenceDate, why: `${o.occurrenceDate} was cancelled, and a cancelled event never comes back` })
      else plan.unchanged += 1
      continue
    }
    if (!valid.has(o.occurrenceDate)) {
      const why =
        night.status === 'removed'
          ? 'the night was removed'
          : night.status === 'paused'
            ? 'the night is paused'
            : (night.skipDates ?? []).includes(o.occurrenceDate)
              ? `${o.occurrenceDate} is skipped`
              : `${o.occurrenceDate} is no longer one of its dates`
      plan.retire.push({ id: o.id, date: o.occurrenceDate, action: o.reminderCount > 0 ? 'cancel' : 'delete', why })
      continue
    }
    const { fields, guideDay } = fieldsFor(night, o.occurrenceDate)
    const was: OccurrenceFields = {
      title: o.title,
      summary: o.summary ?? '',
      start_date: o.startIso,
      end_date: o.endIso,
      timezone: o.timezone,
      category_id: o.categoryId ?? '',
      is_age_restricted: o.ageRestrictionMin !== null && o.ageRestrictionMin > 0,
      age_restriction_min: o.ageRestrictionMin,
    }
    const changes: Record<string, unknown> = {}
    for (const k of Object.keys(fields) as Array<keyof OccurrenceFields>) {
      const differs =
        k === 'start_date' || k === 'end_date' ? !sameInstant(fields[k], was[k]) : fields[k] !== was[k]
      if (differs) changes[k] = fields[k]
    }
    const hoursDiffer = o.opens !== guideDay.opens || o.closes !== guideDay.closes
    if (Object.keys(changes).length === 0 && !hoursDiffer) {
      plan.unchanged += 1
      continue
    }
    plan.update.push({
      id: o.id,
      date: o.occurrenceDate,
      changes: changes as Partial<OccurrenceFields>,
      guideDay: hoursDiffer ? guideDay : null,
    })
  }
  return plan
}
