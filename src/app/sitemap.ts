import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPickerCities } from '@/lib/locations/picker-cities'
import { getAllCommunities } from '@/lib/communities/data'
import { getAllFaiths } from '@/lib/faiths/data'
import { getAllCities, getSuburbsForCity } from '@/lib/cities/data'
import { getSiteUrl } from '@/lib/site-url'
import { GUIDES } from '@/lib/guides'
import { getAllHeroCategories } from '@/lib/hero-categories'
import { helpTopics } from '@/lib/help-content'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'

/**
 * Dynamic sitemap for EventLinqs.
 *
 * Includes:
 *  - homepage + /events (index)
 *  - every picker city under /events/browse/{slug} (launch targets ∪ DB cities).
 *    Zero-event launch cities stay in the sitemap so Google accumulates
 *    authority for when events arrive.
 *  - every published, public event under /events/{slug}.
 *  - every category, help topic, guide and marketing surface worth indexing.
 *
 * LASTMOD IS OMITTED WHERE IT CANNOT BE VERIFIED (2026-08-23).
 *
 * Google publishes exactly one condition for honouring the value:
 *
 *   "Google uses the <lastmod> value if it's consistently and verifiably (for
 *    example by comparing to the last modification of the page) accurate."
 *   https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *   (page last updated 2026-07-08 UTC, fetched 2026-08-23)
 *
 * This file used to stamp `new Date()` on every entry it could not date from
 * real data. Measured on production on 23 August 2026: 524 of 586 URLs, 89.4
 * percent of the sitemap, carried the byte-identical timestamp
 * 2026-08-20T15:11:52.624Z, which was the deploy time. Every city, community,
 * suburb, intersection and legal page was therefore telling Google it had
 * changed at the same millisecond, and would say so again on the next deploy
 * without a word of their content changing.
 *
 * That is the textbook case of a lastmod that is not verifiably accurate, and
 * the risk is not confined to those URLs: a sitemap Google decides it cannot
 * trust on lastmod loses the benefit for the ~54 URLs where the date IS real
 * (events and organisers from `updated_at`, guides from their reviewed date).
 *
 * So the rule here is: a URL carries <lastmod> when, and only when, we hold a
 * real modification date for it. Otherwise the element is omitted. Omission is
 * not a gap, it is the honest encoding of "we do not know", and it costs
 * nothing: Google crawls on its own schedule regardless.
 *
 * NOTE on <changefreq> and <priority>: the same page states "Google ignores
 * <priority> and <changefreq> values." They are kept because other crawlers may
 * still read them and they cost nothing, but no decision here should depend on
 * them, and no future pass should tune them expecting Google to care.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl()

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/events`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    // Index pages added in Batch 9.1.1 + Batch 10.
    {
      url: `${baseUrl}/communities`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/cities`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/organisers`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // The organiser guide hub and every guide: evergreen documentation, the
    // quiet compounding SEO engine (Growth plan). Each guide carries its own
    // reviewed date so a crawler sees real freshness, not a build timestamp.
    {
      url: `${baseUrl}/guides`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...GUIDES.map(guide => ({
      url: `${baseUrl}/guides/${guide.slug}`,
      lastModified: new Date(guide.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/legal/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/cookies`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/refunds`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/organiser-terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/accessibility`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    // MARKETING AND TRUST SURFACES. Every one of these is a public, indexable
    // page that was reachable from the footer but absent from the sitemap, so
    // Google could only find them by following links. They are cheap to list
    // and they carry the brand and trust queries.
    {
      url: `${baseUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/press`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/careers`,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // THE HELP CENTRE. Long-tail organic entry points ("do I get a refund if an
    // event is cancelled"), and the single cheapest compounding SEO surface we
    // own after the guides. The hub was not listed and neither was any topic.
    {
      url: `${baseUrl}/help`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...helpTopics.map(topic => ({
      url: `${baseUrl}/help/${topic.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]

  // CATEGORY LANDING PAGES. These were missing from the sitemap entirely, which
  // is the largest single omission found in the 23 August 2026 audit: they are
  // the surface that answers "comedy tickets", "festivals near me" and every
  // other head category query, and they are the exact shape Eventbrite ranked
  // on for years. Sourced from getAllHeroCategories(), the same list the route
  // itself uses in generateStaticParams, so the sitemap cannot drift from what
  // actually renders.
  for (const category of getAllHeroCategories()) {
    entries.push({
      url: `${baseUrl}/categories/${category.slug}`,
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  const groups = await getPickerCities()
  const allCities = [
    ...groups.australia,
    ...groups.internationalByCountry.flatMap(g => g.cities),
  ]

  for (const c of allCities) {
    entries.push({
      url: `${baseUrl}/events/browse/${c.slug}`,
      changeFrequency: 'daily',
      priority: c.isLaunchCity ? 0.8 : 0.6,
    })
  }

  // Batch 5 - community landing pages.
  for (const community of getAllCommunities()) {
    entries.push({
      url: `${baseUrl}/community/${community.slug}`,
      changeFrequency: 'daily',
      priority: community.tier === 1 ? 0.85 : 0.75,
    })
  }

  // Community Taxonomy v2 - faith landing pages.
  for (const faith of getAllFaiths()) {
    entries.push({
      url: `${baseUrl}/faith/${faith.slug}`,
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  // Batch 6 - city + suburb landing pages.
  for (const city of getAllCities()) {
    entries.push({
      url: `${baseUrl}/city/${city.slug}`,
      changeFrequency: 'daily',
      priority: city.tier === 1 ? 0.9 : 0.75,
    })
    for (const s of getSuburbsForCity(city.slug)) {
      const facing = s.slug.startsWith(`${city.slug}-`) ? s.slug.slice(city.slug.length + 1) : s.slug
      entries.push({
        url: `${baseUrl}/city/${city.slug}/${facing}`,
        changeFrequency: 'daily',
        priority: 0.65,
      })
    }
  }

  // Batch 8 - 271 community × city intersection pages. Hand-crafted
  // editorials shipped at /community/[community]/[city] for 14 communities
  // × selected cities (Tier 1 cities + a few Tier 2). The matrix is
  // generated from getAllCommunities() × the city list visible to the
  // intersection editorial table; here we add every (community, city)
  // combination so search engines have the full surface.
  for (const community of getAllCommunities()) {
    for (const city of getAllCities()) {
      entries.push({
        url: `${baseUrl}/community/${community.slug}/${city.slug}`,
        changeFrequency: 'weekly',
        priority: community.tier === 1 && city.tier === 1 ? 0.7 : 0.55,
      })
    }
  }

  try {
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('slug, updated_at')
      .match(PUBLIC_EVENT_MATCH)
      .not('slug', 'is', null)
      // DETERMINISTIC ORDER. Without an explicit ORDER BY, PostgREST returns
      // rows in Postgres' physical order, which changes as rows are updated.
      // That is not merely untidy: scripts/ci/resolve-gate-urls.mjs picks event
      // pages out of this sitemap, so an unordered query made the Lighthouse
      // gate audit a different page on different runs of the same branch and
      // blocked two merges on 2026-08-23. A sitemap is a published artefact and
      // its order should be a property of the data, not of the storage engine.
      .order('slug', { ascending: true })
      .limit(5000)

    for (const e of events ?? []) {
      if (!e.slug) continue
      entries.push({
        url: `${baseUrl}/events/${e.slug}`,
        ...(e.updated_at ? { lastModified: new Date(e.updated_at) } : {}),
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
    // The profile page resolves an organisation with `.eq('status','active')`
    // and calls notFound() otherwise, so a sitemap without the same predicate
    // advertises pages that 404. Measured on TEST: 8 of 42 organiser URLs
    // (every 'pending' organisation) were listed for Google and returned 404.
    // The two queries must agree; this is the one that was wrong.
    const { data: organisers } = await admin
      .from('organisations')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .eq('status', 'active')
      // Same reason as the events query above: a published artefact should not
      // change order because the storage engine did.
      .order('slug', { ascending: true })
      .limit(5000)
    for (const o of organisers ?? []) {
      if (!o.slug) continue
      entries.push({
        url: `${baseUrl}/organisers/${o.slug}`,
        ...(o.updated_at ? { lastModified: new Date(o.updated_at) } : {}),
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
      // Same reason as the events query above: a published artefact should not
      // change order because the storage engine did.
      .order('slug', { ascending: true })
      .limit(5000)
    for (const v of venues ?? []) {
      if (!v.slug) continue
      entries.push({
        url: `${baseUrl}/venues/${v.slug}`,
        ...(v.updated_at ? { lastModified: new Date(v.updated_at) } : {}),
        changeFrequency: 'weekly',
        priority: 0.55,
      })
    }
  } catch {
    // Sitemap must never 500.
  }

  return entries
}
