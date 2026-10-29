import { isLibraryPhoto } from '@/lib/listings/listing-photo'
import { GENERATED_COVER_PREFIX } from '@/lib/events/generated-cover-prefix'

/**
 * D9, THE WEEKLY SUPPLY SCORECARD PER CITY (the master mandate of 29 October 2026, section 9: "Complete the missing
 * city-level weekly supply reporting. Show: verified upcoming events, new events, expiring events, cancelled events,
 * events awaiting verification, events with approved imagery, active contributing organisers, recurring event
 * suppliers, supply gaps by city and category"; the release checklist's D9: "Success is the count of accurate,
 * useful, upcoming events, not one feed per city").
 *
 * Per city, read now:
 *   verified upcoming      published, not seed, not ended, starting within 90 days, and its listing still fresh (a
 *                          collected night's listing_fresh_until not passed; a night with none needs no re-check)
 *   new this week          published in the last 7 days
 *   expiring soon          verified upcoming whose freshness lapses within 7 days: re-check it or it leaves
 *   cancelled this week    cancelled in the last 7 days
 *   awaiting verification  collected events waiting for a person, placed by their source's city
 *   with approved imagery  verified upcoming with an image supplied for it (the organiser's own upload), never a library
 *                          photograph and never a cover EventLinqs composed in type (generated-covers/)
 *   active organisers      the organisations behind verified upcoming nights, never the EventLinqs listings account
 *   recurring suppliers    a series, or an organisation with recurring nights, behind verified upcoming nights
 *   missing category       verified upcoming nights with no category: missing information a person fills in
 *   gaps                   the categories with nothing verified upcoming in the city
 *
 * Pure: the caller reads the rows (./supply-scorecard.ts) and passes only published, public nights.
 */

/** The four initial markets, always shown first (the mandate's section 9). */
export const MARKETS = ['melbourne', 'geelong', 'ballarat', 'bendigo'] as const

export const HORIZON_DAYS = 90
export const WEEK_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface SupplyNight {
  readonly id: string
  readonly city: string | null
  readonly categoryId: string | null
  readonly status: string
  readonly publishedAt: string | null
  readonly startDate: string
  readonly endDate: string | null
  readonly freshUntil: string | null
  readonly coverUrl: string | null
  readonly organisationId: string | null
  readonly seriesId: string | null
  readonly isRecurring: boolean
  readonly isSeed: boolean
  readonly updatedAt: string
}

export interface SupplyRows {
  /** Published, public nights that have not ended (the caller's read). */
  readonly nights: readonly SupplyNight[]
  /** Cancelled nights, with when they last changed. */
  readonly cancelled: readonly { readonly city: string | null; readonly updatedAt: string; readonly isSeed: boolean }[]
  /** Collected events waiting for a person, with their source's city where it has one. */
  readonly waiting: readonly { readonly city: string | null }[]
  readonly categories: readonly { readonly id: string; readonly name: string }[]
  readonly listingsOrganisationId: string | null
}

export interface CitySupply {
  readonly city: string
  readonly verifiedUpcoming: number
  readonly newThisWeek: number
  readonly expiringSoon: number
  readonly cancelledThisWeek: number
  readonly awaitingVerification: number
  readonly withApprovedImagery: number
  readonly activeOrganisers: number
  readonly recurringSuppliers: number
  /** Verified upcoming nights with no category: missing information a person fills in. */
  readonly missingCategory: number
  /** Category names with nothing verified upcoming, alphabetical. */
  readonly gaps: readonly string[]
}

export interface SupplyScorecard {
  readonly cities: readonly CitySupply[]
  /** Collected events waiting whose source names no city: counted here so none is lost. */
  readonly waitingWithNoCity: number
  readonly readAt: string
}

const ms = (iso: string) => Date.parse(iso)

/** An image supplied for the night: present, not from the library, not a cover EventLinqs composed. */
export function isSuppliedImage(url: string | null): boolean {
  return url !== null && url !== '' && !isLibraryPhoto(url) && !url.includes(`/${GENERATED_COVER_PREFIX}/`)
}

/** Whether a published night counts as verified upcoming now. */
export function isVerifiedUpcoming(n: SupplyNight, now: Date): boolean {
  const t = now.getTime()
  if (n.status !== 'published' || n.isSeed) return false
  const ends = n.endDate === null ? ms(n.startDate) : ms(n.endDate)
  if (ends < t) return false
  if (ms(n.startDate) > t + HORIZON_DAYS * DAY_MS) return false
  return n.freshUntil === null || ms(n.freshUntil) >= t
}

export function supplyScorecard(rows: SupplyRows, now: Date): SupplyScorecard {
  const t = now.getTime()
  const weekAgo = t - WEEK_DAYS * DAY_MS
  const weekAhead = t + WEEK_DAYS * DAY_MS

  const verified = rows.nights.filter((n) => n.city !== null && isVerifiedUpcoming(n, now))
  const seen = new Set<string>(MARKETS)
  const others = [...new Set(verified.map((n) => n.city as string))].filter((c) => !seen.has(c))
  const othersByCount = others.sort((a, b) => verified.filter((n) => n.city === b).length - verified.filter((n) => n.city === a).length || a.localeCompare(b))

  const cityOf = (slug: string): CitySupply => {
    const here = verified.filter((n) => n.city === slug)
    const real = (orgId: string | null) => orgId !== null && orgId !== rows.listingsOrganisationId
    const recurring = new Set<string>()
    for (const n of here) {
      if (n.seriesId !== null) recurring.add(`series:${n.seriesId}`)
      else if (n.isRecurring && real(n.organisationId)) recurring.add(`org:${n.organisationId}`)
    }
    const covered = new Set(here.map((n) => n.categoryId).filter((c): c is string => c !== null))
    return {
      city: slug,
      verifiedUpcoming: here.length,
      newThisWeek: rows.nights.filter((n) => n.city === slug && !n.isSeed && n.status === 'published' && n.publishedAt !== null && ms(n.publishedAt) >= weekAgo && ms(n.publishedAt) <= t).length,
      expiringSoon: here.filter((n) => n.freshUntil !== null && ms(n.freshUntil) <= weekAhead).length,
      cancelledThisWeek: rows.cancelled.filter((c) => c.city === slug && !c.isSeed && ms(c.updatedAt) >= weekAgo).length,
      awaitingVerification: rows.waiting.filter((w) => w.city === slug).length,
      withApprovedImagery: here.filter((n) => isSuppliedImage(n.coverUrl)).length,
      activeOrganisers: new Set(here.map((n) => n.organisationId).filter(real)).size,
      recurringSuppliers: recurring.size,
      missingCategory: here.filter((n) => n.categoryId === null).length,
      gaps: rows.categories
        .filter((c) => !covered.has(c.id))
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b)),
    }
  }

  return {
    cities: [...MARKETS, ...othersByCount].map(cityOf),
    waitingWithNoCity: rows.waiting.filter((w) => w.city === null).length,
    readAt: now.toISOString(),
  }
}
