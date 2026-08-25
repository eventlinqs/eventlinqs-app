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
import { isRedirected } from '@/lib/seo/permanent-redirects'
import { venueSlugify } from '@/lib/venues/resolver'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

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
/**
 * THE SITEMAP MUST NOT OUTLIVE THE DATABASE IT DESCRIBES.
 *
 * `sitemap.ts` is "a special Route Handler that is cached by default unless it
 * uses a Request-time API or dynamic config option"
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md,
 * shipped with next@16.3.0, read 25 August 2026). Cached by default, with no
 * dynamic config, means BAKED AT BUILD.
 *
 * Measured on production on 25 August 2026, four requests over several minutes:
 *
 *     HTTP/1.1 200 OK
 *     Age: 149833            <- 41.6 hours
 *     X-Vercel-Cache: HIT    <- never STALE, so never revalidating
 *     586 <loc> entries
 *
 * The demo purge had removed 46 events and 16 organisations in that window. The
 * sitemap knew nothing about it, so a sweep of all 586 published URLs returned
 * 48 hard 404s: 32 deleted events and 16 deleted organisations, every one of
 * them advertised to Googlebot in writing.
 *
 * `revalidateEventSurfaces` already marks '/sitemap.xml' on every event
 * mutation, which covers everything an organiser does in the product. It cannot
 * cover a change made to the database directly, and the purge was exactly that.
 * So the window is bounded here as well, at the same 300 seconds the event page
 * and the category pages already use, and the two mechanisms cover each other:
 * a product mutation clears it at once, and anything else is five minutes stale
 * at the very worst instead of indefinitely stale.
 */
export const revalidate = 300

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
  /*
   * SIX OF THESE SEVEN ARE PERMANENTLY REDIRECTED BY THIS SAME REPOSITORY.
   *
   * next.config.ts 308s /categories/afrobeats, amapiano, owambe,
   * heritage-and-independence, caribbean and gospel to /community/*. Publishing
   * them here advertised six redirects to Google, against its own instruction on
   * the page that defines a sitemap: "Don't include URLs that redirect or that
   * aren't canonical."
   * https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
   * (fetched 25 August 2026)
   *
   * The destinations are not lost: every /community/<slug> page is published by
   * the community block below. The redirect table is read from the one module
   * that also feeds next.config, so a slug added to or removed from the redirects
   * changes what is published here in the same edit.
   */
  for (const category of getAllHeroCategories()) {
    const path = `/categories/${category.slug}`
    if (isRedirected(path)) continue
    entries.push({
      url: `${baseUrl}${path}`,
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
    const { data: events, error: eventError } = await admin
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

    if (eventError) {
      console.error('[sitemap] events could not be read:', eventError)
    }
    for (const e of events ?? []) {
      if (!e.slug) continue
      entries.push({
        url: `${baseUrl}/events/${e.slug}`,
        ...(e.updated_at ? { lastModified: new Date(e.updated_at) } : {}),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  } catch (err) {
    // Sitemap must never 500. Fall through to the static entries already built,
    // but SAY SO: a silent catch on this exact shape hid a 42703 in the venue
    // block for the whole life of that block.
    console.error('[sitemap] event block failed:', err)
  }

  // Batch 8.2 organiser profile pages.
  try {
    const admin = createAdminClient()
    // The profile page resolves an organisation with `.eq('status','active')`
    // and calls notFound() otherwise, so a sitemap without the same predicate
    // advertises pages that 404. Measured on TEST: 8 of 42 organiser URLs
    // (every 'pending' organisation) were listed for Google and returned 404.
    // The two queries must agree; this is the one that was wrong.
    const { data: organisers, error: organiserError } = await admin
      .from('organisations')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .eq('status', 'active')
      // Same reason as the events query above: a published artefact should not
      // change order because the storage engine did.
      .order('slug', { ascending: true })
      .limit(5000)
    if (organiserError) {
      console.error('[sitemap] organisers could not be read:', organiserError)
    }
    for (const o of organisers ?? []) {
      if (!o.slug) continue
      entries.push({
        url: `${baseUrl}/organisers/${o.slug}`,
        ...(o.updated_at ? { lastModified: new Date(o.updated_at) } : {}),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch (err) {
    // Sitemap must never 500.
    console.error('[sitemap] organiser block failed:', err)
  }

  /*
   * VENUE PROFILE PAGES. THIS BLOCK HAD NEVER EMITTED A SINGLE URL.
   *
   * It used to read `.from('venues').select('slug, updated_at')`. There is no
   * `slug` column on `public.venues` and there never has been. Postgres answers
   *
   *     42703  column venues.slug does not exist
   *
   * and the `catch {}` below threw the error away, so the block reported nothing,
   * published nothing, and looked exactly like a platform with no venues.
   * Reproduced against TEST on 25 August 2026, which holds 18 venue rows:
   *
   *     GET /rest/v1/venues?select=slug,name
   *     {"code":"42703", ... "message":"column venues.slug does not exist"}
   *
   * The route does not key on a column at all. `/venues/[handle]` resolves
   * through `resolveVenueProfile`, whose handle is `venueSlugify(venue.name)`
   * (src/lib/venues/resolver.ts), and it resolves from EITHER an active venues
   * row OR a published event naming that venue.
   *
   * WHAT IS PUBLISHED, AND WHY IT IS THE EVENT SIDE. Handles are derived from
   * `events.venue_name` on publicly visible events, not from the venues table.
   * Two reasons, and both are about only publishing what resolves:
   *
   *   1. `findVenueRowBySlug` reads the first 50 active venues and matches the
   *      slugified name in JavaScript. A 51st venue row would be published here
   *      and 404 on the page. Deriving from events cannot drift from the
   *      resolver, because the events path is the one with no cap.
   *   2. A venue page with no events is an empty page. The market-ready bar in
   *      CLAUDE.md is explicit that a route resolving 200 to a designed empty
   *      state is correct engineering and is still not something to advertise.
   */
  try {
    const admin = createAdminClient()
    const { data: venueEvents, error: venueError } = await admin
      .from('events')
      .select('venue_name, updated_at')
      .match(PUBLIC_EVENT_MATCH)
      .not('venue_name', 'is', null)
      .order('venue_name', { ascending: true })
      .limit(5000)
    if (venueError) {
      // NOT SWALLOWED. A silent catch is what hid the 42703 above for the whole
      // life of this block. The sitemap still must not 500, so this logs and
      // carries on with the entries already built.
      console.error('[sitemap] venue handles could not be read:', venueError)
    }
    /** handle -> most recent updated_at among the events at that venue. */
    const venueHandles = new Map<string, string | null>()
    for (const e of venueEvents ?? []) {
      const name = typeof e.venue_name === 'string' ? e.venue_name.trim() : ''
      if (!name) continue
      const handle = venueSlugify(name)
      if (!handle) continue
      const seen = venueHandles.get(handle) ?? null
      const next = typeof e.updated_at === 'string' ? e.updated_at : null
      if (!venueHandles.has(handle) || (next && (!seen || next > seen))) {
        venueHandles.set(handle, next)
      }
    }
    for (const handle of [...venueHandles.keys()].sort()) {
      const updated = venueHandles.get(handle) ?? null
      entries.push({
        url: `${baseUrl}/venues/${handle}`,
        ...(updated ? { lastModified: new Date(updated) } : {}),
        changeFrequency: 'weekly',
        priority: 0.55,
      })
    }
  } catch (err) {
    console.error('[sitemap] venue block failed:', err)
  }

  /*
   * ARTIST PROFILE PAGES. THERE WAS NO BLOCK AT ALL.
   *
   * `/artists/[slug]` has existed since the artist layer shipped, is public and
   * indexable, and no version of this file has ever listed one. On TEST that is
   * four live, reachable profiles Google is never told about.
   *
   * IT IS GATED ON THE FLAG, AND THAT IS THE WHOLE POINT. The route's first act
   * is `if (!(await isFeatureEnabled('broadcast_artists'))) notFound()`. The flag
   * is TRUE on TEST and FALSE on production (read from `feature_flags` on both,
   * 25 August 2026), so a block that listed artists unconditionally would publish
   * a 404 for every artist the moment production has any. Asking the same
   * question the page asks is the only way the two can agree.
   */
  try {
    if (await isFeatureEnabled('broadcast_artists')) {
      const admin = createAdminClient()
      const { data: artists, error: artistError } = await admin
        .from('artists')
        .select('slug, updated_at')
        .not('slug', 'is', null)
        .order('slug', { ascending: true })
        .limit(5000)
      if (artistError) {
        console.error('[sitemap] artists could not be read:', artistError)
      }
      for (const a of artists ?? []) {
        if (!a.slug) continue
        entries.push({
          url: `${baseUrl}/artists/${a.slug}`,
          ...(a.updated_at ? { lastModified: new Date(a.updated_at) } : {}),
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      }
    }
  } catch (err) {
    console.error('[sitemap] artist block failed:', err)
  }

  return entries
}
