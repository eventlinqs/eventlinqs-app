import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { countOrRaise } from '@/lib/supabase/count-or-raise'
import { getFoundingCounts } from '@/lib/founding/invites'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'

/**
 * The founder's demand-signal aggregates. Read-only, TEST data, real counts
 * only, no PII beyond the operational identifiers the founder acts on. This is
 * the tipping-point view: per-city waitlist demand over time, founding spots
 * taken versus remaining, invites issued and converted, and Launch Kit usage.
 *
 * ---------------------------------------------------------------------------
 * "ALL FIGURES ARE LIVE COUNTS" IS A PROMISE THE PAGE MAKES IN ITS OWN HEADER,
 * and until 20 September 2026 this module could not keep it in either direction.
 *
 * THE CEILING. The waitlist read had no bound. Supabase caps one response at a
 * fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Measured against this project on 20 September 2026, twice, because the second
 * measurement is the one that shows why nothing notices:
 *
 *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
 *     no count requested     HTTP 200   Content-Range: 0-999/*
 *
 * An ordinary read is the second line. The server withholds the total, answers
 * 200 with `error` null and a thousand-long array, and there is nothing in the
 * response a caller could test to find out that 13,381 rows were left out.
 *
 * It had no `order by` either, which is worse than the cap on its own: past the
 * ceiling Postgres is free to return ANY thousand of the matching rows, so the
 * per-city demand figures would have moved between page loads with nothing on
 * the screen to say why. This is the screen whose whole purpose is to say which
 * city has tipped, and it is read by deciding where to go next.
 *
 * THE SILENCE. Every read here discarded its `error` and fell back to a zero:
 * `rows ?? []` for the waitlist, `count ?? 0` for the four Launch Kit figures.
 * A database that could not be reached therefore rendered a screen saying no
 * demand anywhere, no events published and no posters downloaded, which is
 * indistinguishable from a platform nobody is using. A founder acts on that.
 *
 * Both are now loud: `readEveryRow` throws on a failed page, and each count
 * raises with the name of the figure that could not be read.
 */

export type CityDemand = {
  slug: string
  name: string
  total: number
  organisers: number
  attendees: number
  last7: number
  last30: number
}

export type KitUsage = {
  eventsPublished: number
  postersDownloaded: number
  linkClicks: number
  linkConversions: number
}

export type DemandSignal = {
  cities: CityDemand[]
  founding: Awaited<ReturnType<typeof getFoundingCounts>>
  kit: KitUsage
}

export async function getDemandSignal(): Promise<DemandSignal> {
  const admin = createAdminClient()
  const now = Date.now()
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400_000).toISOString()

  const cityDefs = getWaitlistCities()

  // Waitlist rows for the counted cities (excluding unsubscribed for a live
  // demand read). One paged read, bucketed in memory. Ordered by id because a
  // ranged read with no total order is not a read of everything: Postgres may
  // hand one row back in two windows and another in none.
  const rows = await readEveryRow<{
    city_slug: string
    role: string
    created_at: string
    unsubscribed_at: string | null
  }>('the per-city waitlist demand', (from, to) =>
    admin
      .from('city_waitlist_signups')
      .select('city_slug, role, created_at, unsubscribed_at')
      .in('city_slug', cityDefs.map(c => c.slug))
      .order('id', { ascending: true })
      .range(from, to),
  )

  const cities: CityDemand[] = cityDefs.map(def => {
    const mine = rows.filter(r => r.city_slug === def.slug && !r.unsubscribed_at)
    return {
      slug: def.slug,
      name: def.name,
      total: mine.length,
      organisers: mine.filter(r => r.role === 'organiser').length,
      attendees: mine.filter(r => r.role === 'attendee').length,
      last7: mine.filter(r => r.created_at >= iso(7)).length,
      last30: mine.filter(r => r.created_at >= iso(30)).length,
    }
  })

  const [founding, publishedRes, postersRes, clicksRes, convRes] = await Promise.all([
    getFoundingCounts(),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    admin.from('kit_poster_downloads').select('id', { count: 'exact', head: true }),
    admin.from('share_link_events').select('id', { count: 'exact', head: true }).eq('kind', 'click'),
    admin.from('share_link_events').select('id', { count: 'exact', head: true }).eq('kind', 'conversion'),
  ])

  return {
    cities,
    founding,
    kit: {
      eventsPublished: countOrRaise('events published', publishedRes),
      postersDownloaded: countOrRaise('Launch Kit posters downloaded', postersRes),
      linkClicks: countOrRaise('tracked link clicks', clicksRes),
      linkConversions: countOrRaise('tracked link conversions', convRes),
    },
  }
}

