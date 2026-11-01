import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'

/**
 * THE DESK's CITY SECTIONS (the engine directive, C:\dev\DESIGN\CITY-FIRST-1NOV\ENGINE-FINAL-DIRECTIVE-1NOV.md s8; the
 * growth directive, C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s6 and s7; the schedule,
 * C:\dev\GROWTH\growth-30-day-schedule.md (b) 1, 2, 5). One read per city, from the database functions that hold every
 * rule (20261101162001 coverage, 163001 misses, 165501 channel rows) and the experiments register (165001). The cities
 * are the rows of public.city_geography, never a list in code. A failed read throws: an admin page that fails is honest.
 */

export interface CoverageHorizon {
  horizon: string
  unique_discovered: number
  listed: number
  missing: number
  coverage_percent: number | null
}

export interface CityCoverage {
  city: string
  sources: { known: number; healthy: number; failing: number; not_yet_read: number; stopped: number }
  upcoming_in_city: number
  upcoming_nearby: number
  upcoming_by_label: number
  labelled_here_not_yet_placed: number
  labelled_here_but_placed_elsewhere: { event: string; venue: string | null; relation: string }[]
  candidates_discovered: number
  unique_discovered: number
  listed: number
  missing: number
  pending_review: number
  coverage_percent: number | null
  horizons: CoverageHorizon[] | null
  duplicates: number
  stale: number
  expired_or_cancelled: number
  with_authorised_image: number
  with_external_ticketing: number
  selling_through_eventlinqs: number
  by_category: Record<string, number>
}

export interface MissesWeek {
  week: string
  misses: number
  fixed: number
  by_reason: Record<string, number>
}

export interface ChannelWeek {
  week: string
  by_channel: Record<string, { visitors: number; event_page_views: number; checkouts_started: number; paid_sales: number; tickets: number }>
  new_visitors: number
  returning_visitors: number
  paid_orders: number
  gross_ticket_cents: number
  fee_revenue_cents: number
  newsletter_confirmations_all_cities: number
}

export interface CityDesk {
  slug: string
  name: string
  regionName: string
  coverage: CityCoverage
  misses: MissesWeek[]
  channels: ChannelWeek[]
}

export interface Experiment {
  id: string
  title: string
  city_slug: string | null
  channel: string
  hypothesis: string
  primary_metric: string
  budget_cents: number
  starts_on: string
  ends_on: string
  baseline: number | null
  result: number | null
  decision: string | null
}

export interface CoverageDesk {
  cities: CityDesk[]
  experiments: Experiment[]
}

export async function readCoverageDesk(): Promise<CoverageDesk> {
  const db = createAdminClient()
  // Paged, never one read: Supabase stops at 1,000 rows and says nothing (no-silent-row-ceiling).
  const geo = await readEveryRow('the guide cities', (from, to) =>
    db.from('city_geography').select('city_slug, region_name, cities(name)').order('city_slug', { ascending: true }).range(from, to),
  )
  const cities: CityDesk[] = []
  for (const g of (geo ?? []) as unknown as { city_slug: string; region_name: string; cities: { name: string } | null }[]) {
    const [coverage, misses, channels] = await Promise.all([
      readOrThrow(`the coverage of ${g.city_slug}`, () => db.rpc('growth_city_coverage', { p_city: g.city_slug })),
      readOrThrow(`the misses of ${g.city_slug}`, () => db.rpc('growth_misses_weekly', { p_city: g.city_slug })),
      readOrThrow(`the channel weeks of ${g.city_slug}`, () => db.rpc('growth_channel_weekly', { p_city: g.city_slug })),
    ])
    cities.push({
      slug: g.city_slug,
      name: g.cities?.name ?? g.city_slug,
      regionName: g.region_name,
      coverage: coverage as unknown as CityCoverage,
      misses: (misses ?? []) as unknown as MissesWeek[],
      channels: (channels ?? []) as unknown as ChannelWeek[],
    })
  }
  const experiments = await readOrThrow('the growth experiments', () =>
    db.from('growth_experiments')
      .select('id, title, city_slug, channel, hypothesis, primary_metric, budget_cents, starts_on, ends_on, baseline, result, decision')
      .order('starts_on', { ascending: false })
      .limit(50),
  )
  return { cities, experiments: (experiments ?? []) as unknown as Experiment[] }
}
