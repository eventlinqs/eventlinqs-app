import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickerCities } from '@/lib/locations/picker-cities'

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
