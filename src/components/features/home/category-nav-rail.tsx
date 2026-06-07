import { SnapRail } from '@/components/ui/snap-rail'
import { CategoryTile } from '@/components/features/home/cards'
import { getCategoryPhoto } from '@/lib/images/category-photo'
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
  const tiles = await Promise.all(
    CATEGORIES.map(async (c, i) => {
      const photo = await getCategoryPhoto(c.slug)
      const count = counts[c.slug] ?? 0
      return {
        ...c,
        imageSrc: photo.src,
        alt: photo.alt ?? `${c.name} events`,
        metaLabel: count > 0 ? `${count} ${count === 1 ? 'event' : 'events'}` : 'Explore',
        priority: i < 4, // first row above the fold paints eagerly
      }
    }),
  )

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
                }}
              />
            </div>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
