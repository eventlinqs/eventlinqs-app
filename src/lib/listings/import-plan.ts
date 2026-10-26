import type { ListingRow } from './listing-rows'
import { weekdayOf, type SeriesRule } from './occurrences'
import { venueSlugify } from '@/lib/venues/venue-slug'

/**
 * WHAT ONE CHECKED FILE WRITES (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 6).
 *
 * Pure: given the rows the judgement accepted and what the database already
 * holds, it says, row by row, what the import would write, and the import
 * script does exactly that and nothing else. The dry run prints this plan; the
 * apply executes it. Planning again after a partial apply finds what was
 * written and plans only the rest, so a failed apply is finished by running it
 * again.
 *
 * THE RULES IT HOLDS.
 * - A host is found by its name and street address (case, spacing and
 *   punctuation aside). One host named on several rows is one venue.
 * - EventLinqs never writes over what an organiser lists or a host has
 *   claimed, and never lists again a venue or a night that was removed: those
 *   rows are refused, by name.
 * - A row whose source date is newer than the night's last check records a
 *   check: "confirmed" when the night is as stored, "changed" (with the change)
 *   when it is not. A row no newer than the last check writes nothing when it
 *   agrees, and is refused when it disagrees, because an older page does not
 *   overrule a newer one. Importing the same file twice writes nothing the
 *   second time.
 * - A host's own facts (website, Instagram, published email, suburb, city)
 *   come from the rows that write. A blank never erases a stored value, and two
 *   rows of one file that name different values refuse the later one.
 */

export type ListingSource = 'organiser' | 'eventlinqs'

export type ExistingVenue = {
  id: string
  name: string
  address: string | null
  slug: string | null
  suburb: string | null
  citySlug: string | null
  websiteUrl: string | null
  instagramHandle: string | null
  publishedEmail: string | null
  listingSource: ListingSource
  claimedAt: string | null
  removedAt: string | null
}

export type ExistingSeries = {
  id: string
  venueId: string
  name: string
  rule: SeriesRule
  anchorDate: string
  /** "HH:MM" or the database's "HH:MM:SS". */
  startsAt: string
  endsAt: string | null
  timezone: string
  categoryId: string | null
  ageRestrictionMin: number | null
  summary: string
  instagramPostUrl: string | null
  donationOptional: boolean
  listingSource: ListingSource
  status: 'active' | 'paused' | 'removed'
  /** The latest day the source was confirmed, "YYYY-MM-DD", or null before any check. */
  lastCheckedOn: string | null
}

export type GuideCity = { slug: string; name: string; state: string; timezone: string }

export type ImportState = {
  categoryIds: ReadonlyMap<string, string>
  cities: ReadonlyMap<string, GuideCity>
  venues: readonly ExistingVenue[]
  series: readonly ExistingSeries[]
}

/** The host facts a row can set, in the venues table's own column names. */
export type VenueFacts = {
  suburb: string
  city_slug: string
  website_url: string | null
  instagram_handle: string | null
  published_email: string | null
}

/** A new venue; the import adds `organisation_id` (the listings organisation). */
export type VenueInsert = VenueFacts & {
  name: string
  address: string
  slug: string
  city: string
  state: string
  country: 'Australia'
  listing_source: 'eventlinqs'
  is_active: true
}

export type VenueStep =
  | { kind: 'create'; ref: string; values: VenueInsert }
  | { kind: 'update'; id: string; changes: Partial<VenueFacts> }

/** The night's own fields, in event_series' column names. */
export type SeriesFields = {
  starts_at: string
  ends_at: string | null
  timezone: string
  category_id: string
  age_restriction_min: number | null
  summary: string
  instagram_post_url: string | null
  donation_optional: boolean
}

/** A new series; the import adds `organisation_id` and resolves `venue` to its id. */
export type SeriesInsert = SeriesFields & {
  venue: string
  name: string
  rule: SeriesRule
  anchor_date: string
  day: number
  listing_source: 'eventlinqs'
  status: 'active'
}

export type SeriesStep =
  | { kind: 'create'; ref: string; values: SeriesInsert }
  | { kind: 'update'; id: string; changes: Partial<SeriesFields> }
  | { kind: 'confirm'; id: string }

export type CheckOutcome = 'confirmed' | 'changed'

export type PlannedRow =
  | {
      line: number
      name: string
      verdict: 'write'
      series: SeriesStep
      check: { outcome: CheckOutcome; source_url: string; source_date: string }
      /** Every field the row changes, venue and night, by column name. */
      changed: string[]
    }
  | { line: number; name: string; verdict: 'unchanged' }
  | { line: number; name: string; verdict: 'refused'; reasons: string[] }

export type ImportPlan = {
  /** Venue creates and updates, in the order they must run, before any series. */
  venues: VenueStep[]
  rows: PlannedRow[]
  counts: { write: number; unchanged: number; refused: number }
}

const matchText = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const hostKey = (name: string, address: string | null) => `${matchText(name)}|${matchText(address)}`
const clock5 = (t: string | null) => (t === null ? null : t.slice(0, 5))

const FACT_KEYS = ['suburb', 'city_slug', 'website_url', 'instagram_handle', 'published_email'] as const

function factsOf(row: ListingRow): VenueFacts {
  return {
    suburb: row.suburb,
    city_slug: row.citySlug,
    website_url: row.websiteUrl,
    instagram_handle: row.instagramHandle,
    published_email: row.venueEmail,
  }
}

function storedFacts(v: ExistingVenue): Record<(typeof FACT_KEYS)[number], string | null> {
  return {
    suburb: v.suburb,
    city_slug: v.citySlug,
    website_url: v.websiteUrl,
    instagram_handle: v.instagramHandle,
    published_email: v.publishedEmail,
  }
}

type PlannedVenue = {
  ref: string
  existing: ExistingVenue | null
  /** The facts this file has settled, with the line that settled each. */
  settled: Map<string, { value: string; line: number }>
  create: VenueInsert | null
}

export function planImport(
  rows: ReadonlyArray<{ line: number; row: ListingRow }>,
  state: ImportState,
): ImportPlan {
  const existingByKey = new Map(state.venues.map((v) => [hostKey(v.name, v.address), v]))
  const takenSlugs = new Set<string>()
  for (const v of state.venues) {
    if (v.slug) takenSlugs.add(v.slug)
    takenSlugs.add(venueSlugify(v.name))
  }
  const seriesByKey = new Map(
    state.series.map((s) => [`${s.venueId}|${s.name}|${s.rule}|${s.anchorDate}`, s]),
  )

  const planned = new Map<string, PlannedVenue>()
  const plannedSeries = new Map<string, number>()
  const out: PlannedRow[] = []
  let newVenues = 0
  let newSeries = 0

  for (const { line, row } of rows) {
    const refuse = (...reasons: string[]) => out.push({ line, name: row.name, verdict: 'refused', reasons })
    const city = state.cities.get(row.citySlug)
    if (!city) {
      refuse(`city ${row.citySlug} is not a guide city in the database`)
      continue
    }
    const categoryId = state.categoryIds.get(row.categorySlug)
    if (!categoryId) {
      refuse(`category ${row.categorySlug} is not in the database`)
      continue
    }

    // 1. The host.
    const key = hostKey(row.host, row.address)
    const known = planned.get(key)
    const existing = known ? known.existing : existingByKey.get(key) ?? null
    if (existing?.removedAt) {
      refuse(`${row.host} was removed on ${existing.removedAt.slice(0, 10)} and is never listed again`)
      continue
    }
    if (existing && (existing.listingSource === 'organiser' || existing.claimedAt)) {
      refuse(`${row.host} lists its own nights on EventLinqs, so EventLinqs does not list them`)
      continue
    }
    const venueRef = known?.ref ?? existing?.id ?? `venue:${newVenues + 1}`

    // 2. The night.
    const fields: SeriesFields = {
      starts_at: row.startsAt,
      ends_at: row.endsAt,
      timezone: city.timezone,
      category_id: categoryId,
      age_restriction_min: row.ageRestrictionMin,
      summary: row.summary,
      instagram_post_url: row.instagramPostUrl,
      donation_optional: row.donationOptional,
    }
    const seriesKey = `${venueRef}|${row.name}|${row.rule}|${row.date}`
    const repeat = plannedSeries.get(seriesKey)
    if (repeat !== undefined) {
      refuse(`repeats line ${repeat}: the same night of the same host`)
      continue
    }
    const stored = existing ? seriesByKey.get(seriesKey) : undefined
    let series: SeriesStep
    let outcome: CheckOutcome = 'confirmed'
    const changed: string[] = []
    if (!stored) {
      series = {
        kind: 'create',
        ref: `series:${newSeries + 1}`,
        values: {
          ...fields,
          venue: venueRef,
          name: row.name,
          rule: row.rule,
          anchor_date: row.date,
          day: weekdayOf(row.date),
          listing_source: 'eventlinqs',
          status: 'active',
        },
      }
    } else {
      if (stored.status === 'removed') {
        refuse(`${row.name} at ${row.host} was removed and is never listed again`)
        continue
      }
      if (stored.listingSource === 'organiser') {
        refuse(`${row.name} at ${row.host} is the host's own listing now`)
        continue
      }
      const before: SeriesFields = {
        starts_at: clock5(stored.startsAt) as string,
        ends_at: clock5(stored.endsAt),
        timezone: stored.timezone,
        category_id: stored.categoryId ?? '',
        age_restriction_min: stored.ageRestrictionMin,
        summary: stored.summary,
        instagram_post_url: stored.instagramPostUrl,
        donation_optional: stored.donationOptional,
      }
      const changes: Record<string, unknown> = {}
      for (const k of Object.keys(fields) as Array<keyof SeriesFields>) {
        if (fields[k] !== before[k]) {
          changes[k] = fields[k]
          changed.push(k)
        }
      }
      const newer = stored.lastCheckedOn === null || row.sourceDate > stored.lastCheckedOn
      if (!newer) {
        if (changed.length > 0) {
          refuse(
            `its source date ${row.sourceDate} is not newer than the last check (${stored.lastCheckedOn}) but it differs from it: ${changed.join(', ')}`,
          )
        } else {
          plannedSeries.set(seriesKey, line)
          out.push({ line, name: row.name, verdict: 'unchanged' })
        }
        continue
      }
      if (changed.length > 0) {
        series = { kind: 'update', id: stored.id, changes: changes as Partial<SeriesFields> }
        outcome = 'changed'
      } else {
        series = { kind: 'confirm', id: stored.id }
      }
    }

    // 3. The host's facts, settled by the rows that write.
    const venue: PlannedVenue = known ?? {
      ref: venueRef,
      existing,
      settled: new Map(),
      create: null,
    }
    const facts = factsOf(row)
    const conflicts: string[] = []
    const settling: Array<[string, string]> = []
    for (const k of FACT_KEYS) {
      const value = facts[k]
      if (value === null) continue
      const prior = venue.settled.get(k)
      if (prior && prior.value !== value) conflicts.push(`${k} "${value}" differs from line ${prior.line} ("${prior.value}")`)
      else if (!prior) settling.push([k, value])
    }
    if (conflicts.length > 0) {
      refuse(...conflicts)
      continue
    }
    for (const [k, value] of settling) venue.settled.set(k, { value, line })
    if (!known) {
      planned.set(key, venue)
      if (!existing) {
        newVenues += 1
        let slug = venueSlugify(row.host)
        if (takenSlugs.has(slug)) slug = `${slug}-${venueSlugify(row.suburb)}`
        for (let n = 2; takenSlugs.has(slug); n += 1) slug = `${slug.replace(/-\d+$/, '')}-${n}`
        takenSlugs.add(slug)
        venue.create = {
          ...facts,
          name: row.host,
          address: row.address,
          slug,
          city: city.name,
          state: city.state,
          country: 'Australia',
          listing_source: 'eventlinqs',
          is_active: true,
        }
      }
    }
    if (series.kind === 'create') {
      newSeries += 1
    }
    plannedSeries.set(seriesKey, line)
    if (existing) {
      const was = storedFacts(existing)
      for (const [k, value] of settling) if (was[k as (typeof FACT_KEYS)[number]] !== value) changed.push(k)
    }
    out.push({
      line,
      name: row.name,
      verdict: 'write',
      series,
      check: { outcome, source_url: row.sourceUrl, source_date: row.sourceDate },
      changed,
    })
  }

  const venues: VenueStep[] = []
  for (const v of planned.values()) {
    if (v.create) {
      // A create carries every fact the file settled, whichever row settled it.
      const values = { ...v.create }
      for (const k of FACT_KEYS) {
        const s = v.settled.get(k)
        if (s) (values as Record<string, unknown>)[k] = s.value
      }
      venues.push({ kind: 'create', ref: v.ref, values })
    } else if (v.existing) {
      const was = storedFacts(v.existing)
      const changes: Partial<VenueFacts> = {}
      for (const [k, s] of v.settled) {
        if (was[k as (typeof FACT_KEYS)[number]] !== s.value) (changes as Record<string, unknown>)[k] = s.value
      }
      if (Object.keys(changes).length > 0) venues.push({ kind: 'update', id: v.existing.id, changes })
    }
  }

  const counts = { write: 0, unchanged: 0, refused: 0 }
  for (const r of out) counts[r.verdict] += 1
  return { venues, rows: out, counts }
}
