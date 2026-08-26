import { SnapRail } from '@/components/ui/snap-rail'
import { CategoryTile } from '@/components/features/home/cards'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { getCommunityHeroPhoto } from '@/lib/images/community-photo'
import { getSpineCategoryTile } from '@/lib/images/spine'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP } from '@/lib/ui/rhythm'
import { createPublicClient } from '@/lib/supabase/public-client'
import { CURATED_HOMEPAGE_CATEGORY_SLUGS } from '@/lib/categories/homepage-curation'
import { captureException } from '@/lib/observability/sentry'

/**
 * CategoryNavRail - the homepage category entry, directly under the hero.
 *
 * Replaces the early-concept pill/chip strip (Batch 9.2). The competitor
 * reference is direct: Ticketmaster surfaces categories as an image-led
 * "Discover" set and Eventbrite as a category-browse row. Here that job is
 * done in the locked system - the same separated image tile used for cities
 * and venues (photo in a 3/2 frame, label below, never on the image), in a
 * plain CAPS-headed scroll rail. No pills.
 *
 * General categories lead, matching the rails further down the page. Each
 * tile carries the live upcoming-event count where there is one, else a
 * plain "Explore" so the category is always reachable.
 */

/**
 * WHICH nine and in WHAT order is the curation and lives in one place. The
 * display NAME is read from `event_categories`, because a name typed here is a
 * copy of a value that already exists, and this one had already drifted on five
 * of the nine tiles before anybody looked.
 *
 * Founder ruling 26 August 2026, and the reasoning is in
 * src/lib/categories/homepage-curation.ts.
 */
async function curatedCategories(): Promise<{ slug: string; name: string }[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('event_categories')
    .select('slug, name')
    .in('slug', [...CURATED_HOMEPAGE_CATEGORY_SLUGS])

  if (error) {
    // NOT SWALLOWED. A failed read here would otherwise render a rail of tiles
    // with no names at all, which reads as a broken homepage rather than as a
    // database problem. scripts/guards/no-silent-catch.mjs exists for this shape.
    captureException(error, { where: 'features/home/category-nav-rail:curatedCategories' })
  }

  const bySlug = new Map((data ?? []).map(c => [c.slug, c.name]))
  // The curated ORDER is authoritative; the database supplies the name only.
  // A slug missing from the database is dropped rather than rendered nameless,
  // and scripts/guards/curated-categories-exist.mjs fails the build before that
  // can reach anybody.
  return CURATED_HOMEPAGE_CATEGORY_SLUGS.flatMap(slug => {
    const name = bySlug.get(slug)
    return name ? [{ slug, name }] : []
  })
}

export async function CategoryNavRail({ counts }: { counts: Record<string, number> }) {
  const CATEGORIES = await curatedCategories()
  const [tiles, communityDoorImage] = await Promise.all([
    Promise.all(
      CATEGORIES.map(async (c, i) => {
        // Spine-first: licensed category tile photo; Pexels stays the fallback
        // for categories with no spine slot (e.g. comedy).
        const spine = getSpineCategoryTile(c.slug)
        const count = counts[c.slug] ?? 0
        if (spine) {
          return {
            ...c,
            imageSrc: spine.src,
            alt: `${c.name} events`,
            objectPosition: spine.objectPosition as string | undefined,
            metaLabel: count > 0 ? `${count} ${count === 1 ? 'event' : 'events'}` : 'Explore',
            priority: i < 4,
          }
        }
        const photo = await getCategoryPhoto(c.slug)
        return {
          ...c,
          imageSrc: photo.src,
          alt: photo.alt ?? `${c.name} events`,
          objectPosition: undefined as string | undefined,
          metaLabel: count > 0 ? `${count} ${count === 1 ? 'event' : 'events'}` : 'Explore',
          priority: i < 4, // first row above the fold paints eagerly
        }
      }),
    ),
    // Doorway tile image - a representative community photo (branded fallback in
    // CategoryTileImage if null), so the doorway is never a broken image.
    getCommunityHeroPhoto('african'),
  ])

  return (
    <section aria-label="Browse by category" className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="Categories"
          title="Browse by category"
          headerLink={{ href: '/events', label: 'View all' }}
          railLabel="Browse by category"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {/* Communities doorway - leads the rail, links to the resolving
              /communities hub (the moat entry from the very first rail). */}
          <div className="w-[220px] shrink-0 snap-start sm:w-[260px]">
            <CategoryTile
              category={{
                href: '/communities',
                imageSrc: communityDoorImage ?? '',
                alt: 'Browse events by community',
                name: 'Communities',
                metaLabel: '21 heritages',
                priority: true,
              }}
            />
          </div>
          {tiles.map(t => (
            <div key={t.slug} className="w-[220px] shrink-0 snap-start sm:w-[260px]">
              <CategoryTile
                category={{
                  href: `/events?category=${t.slug}`,
                  imageSrc: t.imageSrc,
                  alt: t.alt,
                  name: t.name,
                  metaLabel: t.metaLabel,
                  priority: t.priority,
                  objectPosition: t.objectPosition,
                }}
              />
            </div>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
