import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundingCounts } from '@/lib/founding/invites'
import { getWaitlistCities } from '@/lib/waitlist/city-waitlist'

/**
 * The founder's demand-signal aggregates. Read-only, TEST data, real counts
 * only, no PII beyond the operational identifiers the founder acts on. This is
 * the tipping-point view: per-city waitlist demand over time, founding spots
 * taken versus remaining, invites issued and converted, and Launch Kit usage.
 */

export type CityDemand = {
  slug: string
  name: string
  openingFirst: boolean
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
  // demand read). One query, bucketed in memory.
  const { data: rows } = await admin
    .from('city_waitlist_signups')
    .select('city_slug, role, created_at, unsubscribed_at')
    .in('city_slug', cityDefs.map(c => c.slug))

  const cities: CityDemand[] = cityDefs.map(def => {
    const mine = (rows ?? []).filter(r => r.city_slug === def.slug && !r.unsubscribed_at)
    return {
      slug: def.slug,
      name: def.name,
      openingFirst: def.openingFirst,
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
      eventsPublished: publishedRes.count ?? 0,
      postersDownloaded: postersRes.count ?? 0,
      linkClicks: clicksRes.count ?? 0,
      linkConversions: convRes.count ?? 0,
    },
  }
}
