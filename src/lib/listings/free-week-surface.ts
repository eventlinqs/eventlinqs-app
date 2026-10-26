import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { fetchFreeWeekEvents } from '@/lib/events/fetchers'
import type { PublicEventRow } from '@/lib/events/types'
import { FREE_WEEK_LIMIT, freeWeekWindow } from './free-week'

/**
 * THE CITY GUIDE'S "THIS WEEK" SURFACE, READ IN ONE PLACE (WI2 Part 2), the
 * shape `/this-weekend` set (src/lib/events/weekend-surface.ts): the page, the
 * sitemap and the metadata ask this one module, so they cannot disagree about
 * which cities have a guide or whether a page is worth offering a search engine.
 *
 * WHICH CITIES: the cities table's own `free_guide` flag (ruling a of
 * 21 October 2026: "Cities live in a table, so adding a city or a state is a
 * row, never code"), with each city's own zone, written by WI2 Part 1.
 */

export interface GuideCity {
  slug: string
  name: string
  state: string
  timezone: string
}

/**
 * NO SERVICE-ROLE KEY, NO ADMIN READ, the fail-soft fetchPublicEventsCached
 * uses (src/lib/events/fetchers.ts): the CI build job carries only NEXT_PUBLIC
 * values, and createAdminClient throws there, which failed /sitemap.xml's
 * prerender on #186. Such a host reads no guide city, so it offers no week;
 * wherever the key exists, nothing changes.
 */
function noServiceKey(): boolean {
  if (getSupabaseServiceRoleKey()) return false
  console.warn('[free-week] no service-role key on this host; no guide city is read')
  return true
}

export async function readGuideCities(): Promise<GuideCity[]> {
  if (noServiceKey()) return []
  const { data, error } = await createAdminClient()
    .from('cities')
    .select('slug, name, state, timezone')
    .eq('free_guide', true)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) {
    console.error('[free-week] the guide cities could not be read:', error.message)
    return []
  }
  return (data ?? []) as GuideCity[]
}

/**
 * One guide city by its slug, or null for a city with no guide (the page answers
 * 404). Cached per request with React's `cache`, so the page's head and body read
 * it once (scripts/guards/the-head-and-the-body-ask-once.mjs).
 */
export const readGuideCity = cache(async function readGuideCity(slug: string): Promise<GuideCity | null> {
  if (noServiceKey()) return null
  const { data, error } = await createAdminClient()
    .from('cities')
    .select('slug, name, state, timezone')
    .eq('slug', slug)
    .eq('free_guide', true)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`the guide city ${slug} could not be read: ${error.message}`)
  return (data as GuideCity | null) ?? null
})

export interface FreeWeekSurface {
  city: GuideCity
  /** The start of today in the city's zone. */
  from: Date
  /** The last instant of the sixth day after, in the city's zone. */
  to: Date
  /** Soonest first, at most FREE_WEEK_LIMIT. */
  events: PublicEventRow[]
  /** Every free event on this week in the city, uncapped. Drives indexability. */
  total: number
}

/**
 * The week, its events and its true count, cached per request like the city, so
 * the head and the body ask once. `now` is an argument so a test can pin a week;
 * the page and the sitemap pass none.
 */
export const loadFreeWeek = cache(async function loadFreeWeek(city: GuideCity, now: Date = new Date()): Promise<FreeWeekSurface> {
  const { from, to } = freeWeekWindow(now, city.timezone)
  const { events, total } = await fetchFreeWeekEvents({
    citySlug: city.slug,
    cityName: city.name,
    to,
    limit: FREE_WEEK_LIMIT,
    now,
  })
  return { city, from, to, events, total }
})
