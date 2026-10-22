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
 */

export type ListingNight = NightForOccurrences & { id: string; organisationId: string; venueId: string }

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
}

export async function runOccurrences(store: OccurrenceStore, now: Date): Promise<RunSummary> {
  const summary: RunSummary = {
    nights: 0,
    created: 0,
    updated: 0,
    cancelled: 0,
    deleted: 0,
    unchanged: 0,
    held: [],
    failed: [],
  }
  for (const night of await store.nights(now)) {
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
      const result = r.action === 'cancel' ? await store.cancel(r.id) : await store.delete(r.id)
      record(r.date, result, () => (r.action === 'cancel' ? (summary.cancelled += 1) : (summary.deleted += 1)))
    }
    for (const u of plan.update) {
      record(u.date, await store.update({ id: u.id, changes: u.changes, guideDay: u.guideDay }), () => (summary.updated += 1))
    }
    for (const c of plan.create) {
      record(c.date, await store.create({ night, ...c }), () => (summary.created += 1))
    }
  }
  return summary
}
