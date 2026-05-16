import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { getAllCultures } from '@/lib/cultures/data'
import { getAllFaiths } from '@/lib/faiths/data'
import { getAllCities, getSuburbsForCity } from '@/lib/cities/data'
import { getSiteUrl } from '@/lib/site-url'

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
  const baseUrl = getSiteUrl()
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
    // Index pages added in Batch 9.1.1 + Batch 10.
    {
      url: `${baseUrl}/cultures`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/cities`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/organisers`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/cookies`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/refunds`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/organiser-terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/accessibility`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
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

  // Culture Taxonomy v2 - faith landing pages.
  for (const faith of getAllFaiths()) {
    entries.push({
      url: `${baseUrl}/faith/${faith.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
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

  // Batch 8 - 271 culture × city intersection pages. Hand-crafted
  // editorials shipped at /culture/[culture]/[city] for 14 cultures
  // × selected cities (Tier 1 cities + a few Tier 2). The matrix is
  // generated from getAllCultures() × the city list visible to the
  // intersection editorial table; here we add every (culture, city)
  // combination so search engines have the full surface.
  for (const culture of getAllCultures()) {
    for (const city of getAllCities()) {
      entries.push({
        url: `${baseUrl}/culture/${culture.slug}/${city.slug}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: culture.tier === 1 && city.tier === 1 ? 0.7 : 0.55,
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

  // Batch 8.2 organiser profile pages.
  try {
    const admin = createAdminClient()
    const { data: organisers } = await admin
      .from('organisations')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .limit(5000)
    for (const o of organisers ?? []) {
      if (!o.slug) continue
      entries.push({
        url: `${baseUrl}/organisers/${o.slug}`,
        lastModified: o.updated_at ? new Date(o.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch {
    // Sitemap must never 500.
  }

  // Batch 8.3 venue profile pages.
  try {
    const admin = createAdminClient()
    const { data: venues } = await admin
      .from('venues')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .limit(5000)
    for (const v of venues ?? []) {
      if (!v.slug) continue
      entries.push({
        url: `${baseUrl}/venues/${v.slug}`,
        lastModified: v.updated_at ? new Date(v.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.55,
      })
    }
  } catch {
    // Sitemap must never 500.
  }

  return entries
}
