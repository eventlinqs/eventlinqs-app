import { SnapRail } from '@/components/ui/snap-rail'
import { CategoryTile } from '@/components/features/home/cards'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { getCultureHeroPhoto } from '@/lib/images/culture-photo'
import { getSpineCategoryTile } from '@/lib/images/spine'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP } from '@/lib/ui/rhythm'

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

const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'music', name: 'Music' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'food-drink', name: 'Food and drink' },
  { slug: 'festival', name: 'Festivals' },
  { slug: 'arts-culture', name: 'Arts and theatre' },
  { slug: 'nightlife', name: 'Nightlife' },
  { slug: 'sports', name: 'Sport' },
  { slug: 'family', name: 'Family' },
  { slug: 'business-networking', name: 'Business' },
]

export async function CategoryNavRail({ counts }: { counts: Record<string, number> }) {
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
    getCultureHeroPhoto('african'),
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
              /cultures hub (the moat entry from the very first rail). */}
          <div className="w-[220px] shrink-0 snap-start sm:w-[260px]">
            <CategoryTile
              category={{
                href: '/cultures',
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
