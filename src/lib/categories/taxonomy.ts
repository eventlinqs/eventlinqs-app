/**
 * THE CATEGORY TAXONOMY, READ FROM THE DATABASE, IN ONE PLACE.
 *
 * Close-out SEO3 step 4 requires the category pages to be built "one page per
 * category read from the taxonomy in the database and never a literal list".
 * Three callers need that list and they must not each grow their own copy:
 *
 *   src/app/categories/[slug]/page.tsx   decides whether a slug is a page
 *   src/app/sitemap.ts                   decides which pages to publish
 *   the category strip on the page       cross-links the siblings
 *
 * A second reader is how the homepage rail and `/events` drifted apart before
 * (see src/lib/categories/homepage-curation.ts, which records five names that
 * had wandered out of agreement with nobody comparing them). One reader, cached
 * per request, is the answer.
 *
 * THE EDITORIAL IS NOT HERE AND IS NOT OPTIONAL. A row with no entry in
 * category-editorial.ts is not served as a page, because the alternative is a
 * page that derives its own copy from its own name, which is the generic
 * template Law 1 refuses and the duplicate Google collapses. The build does not
 * let that state ship: `scripts/guards/discovery-indexability.mjs` fails when a
 * live row has no editorial. This function's own filter is the runtime half of
 * the same rule, so a row added to the database between two deployments degrades
 * to "not a page yet" rather than to "a generic page".
 */
import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { EVENT_DATA_CACHE_TAGS } from '@/lib/events/cache-tags'
import { getCategoryEditorial, type CategoryEditorial } from './category-editorial'

export interface CategoryRow {
  slug: string
  name: string
  sortOrder: number
}

/** A category that has both a database row and written editorial. */
export interface PublishableCategory extends CategoryRow {
  editorial: CategoryEditorial
}

async function loadRows(): Promise<CategoryRow[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('event_categories')
    .select('slug, name, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    // NOT SWALLOWED. An empty taxonomy would silently drop 22 URLs out of the
    // sitemap and 404 every category page, which is the loudest possible
    // failure wearing the quietest possible clothes. The same reasoning, and
    // the same shape, as loadDiscoveryRows in src/lib/seo/discovery-counts.ts.
    console.error('[category-taxonomy] event_categories could not be read:', error)
    throw new Error(`category taxonomy unavailable: ${error.message}`)
  }

  return (data ?? []).map(r => ({
    slug: r.slug,
    name: r.name,
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 0,
  }))
}

/*
 * THE TAG IS READ OUT OF THE REGISTRY AT THE DECLARATION, not spelled here.
 *
 * `EVENT_DATA_CACHE_TAGS[2]` is `event-categories`, the same tag
 * `fetchActiveCategoriesCached` declares, so `revalidateEventSurfaces` clears
 * this cache on every event mutation exactly as it clears that one.
 *
 * It was a local `const CACHE_TAG = 'event-categories'` for one drill, and
 * `scripts/guards/one-visibility-source.mjs` refused it: a tag named only at the
 * declaration is a tag nobody invalidates, which is how every cache in this
 * codebase but one came to expire on a timer and on nothing else, and how the
 * /events rail went on serving eight deleted events after the demo purge. The
 * guard caught this one on 14 September 2026, before it was committed.
 */
const cachedRows = unstable_cache(loadRows, ['event-categories-v1'], {
  revalidate: 300,
  tags: [EVENT_DATA_CACHE_TAGS[2]],
})

/**
 * Every category that is a real page: a live row with written editorial.
 *
 * Ordered by the taxonomy's own sort order, so the strip on the page and the
 * order in the sitemap are the order the owner set in the database.
 */
export async function getPublishableCategories(): Promise<PublishableCategory[]> {
  const rows = await cachedRows()
  const out: PublishableCategory[] = []
  for (const row of rows) {
    const editorial = getCategoryEditorial(row.slug)
    if (editorial) out.push({ ...row, editorial })
  }
  return out
}

/** One category, or null when the slug is not a page. */
export async function getPublishableCategory(slug: string): Promise<PublishableCategory | null> {
  const wanted = slug.trim().toLowerCase()
  const all = await getPublishableCategories()
  return all.find(c => c.slug === wanted) ?? null
}
