/**
 * THE HUNT'S LOG, PER CITY (car 44; the CONTROLLER's 15:20 of 4 November 2026: 'logs per city: new big events found, total
 * upcoming by tier'). Read after each run: the nights the run listed by the hunt's rule and those it left for a person,
 * by the source's own city, and every published night still to come in each guide city counted by law 18's tier
 * (src/lib/events/relevance.ts), so a day's log says whether the big nights are growing.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectionResult } from './collect-run'
import { HUNT_SOURCES } from './headline-hunt'
import { tierOf, type Tier } from '@/lib/events/relevance'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { readEveryRow } from '@/lib/supabase/read-every-row'

export type HuntCityLog = {
  citySlug: string
  newBigEvents: number
  waiting: number
  upcomingByTier: Record<Tier, number>
}

export const HUNT_CITIES = ['melbourne', 'geelong', 'ballarat', 'bendigo'] as const

export async function huntDay(db: SupabaseClient, result: CollectionResult, now: Date): Promise<HuntCityLog[]> {
  const ids = result.sources.map((s) => s.sourceId)
  const cityOf = new Map<string, string>()
  if (ids.length > 0) {
    const { data, error } = await db.from('listing_sources').select('id, city_slug').in('id', ids)
    if (error) throw new Error(`the sources' cities could not be read: ${error.message}`)
    for (const r of data ?? []) cityOf.set(r.id as string, (r.city_slug as string | null) ?? '')
  }
  const rows = await readEveryRow<Record<string, unknown>>('the upcoming nights by city', (from, to) =>
    db
      .from('events')
      .select('id, title, venue_name, city_primary, is_free, entry_mode, external_ticket_url, category:event_categories!events_category_id_fkey(slug)')
      .match(PUBLIC_EVENT_MATCH)
      .or(listingWindowOrPredicate(now))
      .in('city_primary', [...HUNT_CITIES])
      .order('id')
      .range(from, to),
  )
  return HUNT_CITIES.map((citySlug) => {
    const upcomingByTier: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const e of rows.filter((r) => r.city_primary === citySlug)) {
      const category = (Array.isArray(e.category) ? e.category[0] : e.category) as { slug?: string | null } | null
      const tier = tierOf({
        title: (e.title as string) ?? '',
        venue: (e.venue_name as string | null) ?? null,
        categorySlug: category?.slug ?? null,
        ticketed: e.is_free !== true && e.entry_mode !== 'walk_in',
      })
      upcomingByTier[tier] += 1
    }
    const mine = result.sources.filter((s) => cityOf.get(s.sourceId) === citySlug)
    return {
      citySlug,
      newBigEvents: mine.reduce((n, s) => n + s.acceptedByRule, 0),
      waiting: mine.reduce((n, s) => n + s.queued, 0),
      upcomingByTier,
    }
  })
}

/** The hunt list's cities, for a check that every guide city is hunted. */
export const HUNTED_CITIES = [...new Set(HUNT_SOURCES.map((h) => h.citySlug))]
