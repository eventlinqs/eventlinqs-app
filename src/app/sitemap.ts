import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { getAllCultures } from '@/lib/cultures/data'
import { getAllCities, getSuburbsForCity } from '@/lib/cities/data'

/**
 * Dynamic sitemap for EventLinqs.
 *
 * Includes:
 *  - homepage + /events (index)
 *  - every picker city under /events/browse/{slug} (launch targets ∪ DB cities).
 *    Zero-event launch cities stay in the sitemap so Google accumulates
 *    authority for when events arrive.
 *  - every published, public event under /events/{slug}.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const now = new Date()

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  const groups = await getPickerCities()
  const allCities = [
    ...groups.australia,
    ...groups.internationalByCountry.flatMap(g => g.cities),
  ]

  for (const c of allCities) {
    entries.push({
      url: `${baseUrl}/events/browse/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: c.isLaunchCity ? 0.8 : 0.6,
    })
  }

  // Batch 5 - culture landing pages.
  for (const culture of getAllCultures()) {
    entries.push({
      url: `${baseUrl}/culture/${culture.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: culture.tier === 1 ? 0.85 : 0.75,
    })
  }

  // Batch 6 - city + suburb landing pages.
  for (const city of getAllCities()) {
    entries.push({
      url: `${baseUrl}/city/${city.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: city.tier === 1 ? 0.9 : 0.75,
    })
    for (const s of getSuburbsForCity(city.slug)) {
      const facing = s.slug.startsWith(`${city.slug}-`) ? s.slug.slice(city.slug.length + 1) : s.slug
      entries.push({
        url: `${baseUrl}/city/${city.slug}/${facing}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.65,
      })
    }
  }

  try {
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('slug, updated_at')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .not('slug', 'is', null)
      .limit(5000)

    for (const e of events ?? []) {
      if (!e.slug) continue
      entries.push({
        url: `${baseUrl}/events/${e.slug}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  } catch {
    // Sitemap must never 500. Fall through to the static entries already built.
  }

  return entries
}
