import type { SeriesBookingLink } from './listing-rows'
import {
  planOccurrences,
  type ExistingOccurrence,
  type NightForOccurrences,
  type OccurrenceFields,
  type OccurrenceGuideDay,
} from './occurrence-plan'

/**
 * THE DAILY RUN THAT KEEPS EVERY NIGHT'S DATES (WI2 Part 1, WI2-PLAN.md section 7).
 *
 * For each night it plans (occurrence-plan.ts) and then does the plan through a
 * store, so the rules are tested against a store held in memory and the real
 * store only reads and writes. Order within a night: dates come off first (a
 * delete frees its date), then future dates are brought in line, then missing
 * dates are made. One night failing never stops the others: its reason is
 * recorded by name and the run goes on.
 *
 * IT WORKS TO A DEADLINE when given one. The platform ends a function at its
 * maximum duration, and a first fill after an import owes about 300 dates at
 * several seconds each (measured on the Part 2 drive, 24 October 2026), so the
 * run checks the deadline before every write, never inside one, and stops
 * saying how many nights it did not finish. The next run carries on: the plan
 * is read afresh, so what was made is left alone.
 */

export type ListingNight = NightForOccurrences & {
  id: string
  organisationId: string
  venueId: string
  /** Where the night sells (WI3, event_series.booking_links); empty or absent for a free walk-in night. */
  bookingLinks?: SeriesBookingLink[]
}

export type CreateOccurrence = {
  night: ListingNight
  date: string
  fields: OccurrenceFields
  guideDay: OccurrenceGuideDay
}

export type StoreResult = { ok: true } | { ok: false; reason: string }

export type OccurrenceStore = {
  /** Every active night, and every other night that still has a future occurrence. */
  nights(now: Date): Promise<ListingNight[]>
  occurrences(seriesId: string): Promise<ExistingOccurrence[]>
  create(input: CreateOccurrence): Promise<StoreResult>
  update(input: {
    id: string
    changes: Partial<OccurrenceFields>
    guideDay: OccurrenceGuideDay | null
  }): Promise<StoreResult>
  cancel(id: string): Promise<StoreResult>
  delete(id: string): Promise<StoreResult>
}

export type RunSummary = {
  nights: number
  created: number
  updated: number
  cancelled: number
  deleted: number
  unchanged: number
  held: Array<{ seriesId: string; date: string; why: string }>
  failed: Array<{ seriesId: string; date: string | null; why: string }>
  /** True when it reached its deadline before finishing every night's plan. */
  stoppedEarly: boolean
  /** The nights whose plan it did not finish, the one it stopped in included. */
  nightsNotReached: number
}

export type RunOptions = {
  /** Epoch milliseconds after which no write is started; one already started always finishes. */
  deadline?: number
  /** Epoch milliseconds now. Given by tests; the real clock otherwise. */
  clock?: () => number
}

export async function runOccurrences(store: OccurrenceStore, now: Date, options: RunOptions = {}): Promise<RunSummary> {
  const summary: RunSummary = {
    nights: 0,
    created: 0,
    updated: 0,
    cancelled: 0,
    deleted: 0,
    unchanged: 0,
    held: [],
    failed: [],
    stoppedEarly: false,
    nightsNotReached: 0,
  }
  const clock = options.clock ?? Date.now
  const outOfTime = () => options.deadline !== undefined && clock() >= options.deadline
  const nights = await store.nights(now)
  for (let i = 0; i < nights.length; i += 1) {
    const night = nights[i]
    const stop = () => {
      summary.stoppedEarly = true
      summary.nightsNotReached = nights.length - i
      return summary
    }
    if (outOfTime()) return stop()
    summary.nights += 1
    let plan: ReturnType<typeof planOccurrences>
    try {
      plan = planOccurrences(night, await store.occurrences(night.id), now)
    } catch (error) {
      summary.failed.push({ seriesId: night.id, date: null, why: error instanceof Error ? error.message : String(error) })
      continue
    }
    summary.unchanged += plan.unchanged
    for (const h of plan.held) summary.held.push({ seriesId: night.id, ...h })

    const record = (date: string, result: StoreResult, counted: () => void) => {
      if (result.ok) counted()
      else summary.failed.push({ seriesId: night.id, date, why: result.reason })
    }
    for (const r of plan.retire) {
      if (outOfTime()) return stop()
      const result = r.action === 'cancel' ? await store.cancel(r.id) : await store.delete(r.id)
      record(r.date, result, () => (r.action === 'cancel' ? (summary.cancelled += 1) : (summary.deleted += 1)))
    }
    for (const u of plan.update) {
      if (outOfTime()) return stop()
      record(u.date, await store.update({ id: u.id, changes: u.changes, guideDay: u.guideDay }), () => (summary.updated += 1))
    }
    for (const c of plan.create) {
      if (outOfTime()) return stop()
      record(c.date, await store.create({ night, ...c }), () => (summary.created += 1))
    }
  }
  return summary
}
