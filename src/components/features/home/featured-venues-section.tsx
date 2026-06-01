import { SnapRail } from '@/components/ui/snap-rail'
import { CityTile } from '@/components/features/home/cards'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { RawRow } from '@/lib/events/home-queries'

/**
 * FeaturedVenuesSection: groups upcoming events by venue_name and renders a
 * rail of the top 10 venues by upcoming-event count. Tile mirrors the
 * separated-card pattern: image at top in 3/2 frame with venue name on a
 * darkened-gradient label band, white card body below with city + event
 * count + arrow.
 */

interface VenueGroup {
  name: string
  city: string | null
  count: number
  categorySlug: string | null
  imageSrc: string | null
  imageAlt: string | null
}

interface Props {
  upcoming: RawRow[]
}

export async function FeaturedVenuesSection({ upcoming }: Props) {
  const grouped = new Map<string, VenueGroup>()
  for (const e of upcoming) {
    const venue = e.venue_name?.trim()
    if (!venue) continue
    const existing = grouped.get(venue.toLowerCase())
    if (existing) {
      existing.count++
      continue
    }
    grouped.set(venue.toLowerCase(), {
      name: venue,
      city: e.venue_city ?? null,
      count: 1,
      categorySlug: e.category?.slug ?? null,
      imageSrc: null,
      imageAlt: null,
    })
  }

  const top = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10)

  await Promise.all(
    top.map(async v => {
      const photo = await getCategoryPhoto(v.categorySlug)
      v.imageSrc = photo.src
      v.imageAlt = photo.alt
    }),
  )

  if (top.length === 0) return null

  return (
    <section aria-label="Featured venues" className={`border-t border-ink-200 bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="Featured venues"
          title="Where the city goes"
          headerLink={{ href: '/events', label: 'View all' }}
          railLabel="Featured venues"
          containerBg="canvas"
        >
          {top.map(v => (
            <div key={v.name} className="w-[240px] shrink-0 snap-start sm:w-[280px]">
              <CityTile
                city={{
                  href: `/events?venue=${encodeURIComponent(v.name)}`,
                  imageSrc: v.imageSrc ?? '',
                  alt: v.imageAlt ?? v.name,
                  name: v.name,
                  metaLabel: v.city
                    ? `${v.city} \u00B7 ${v.count} ${v.count === 1 ? 'event' : 'events'}`
                    : `${v.count} ${v.count === 1 ? 'event' : 'events'}`,
                }}
              />
            </div>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
