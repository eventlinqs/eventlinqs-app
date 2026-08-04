import { SnapRail } from '@/components/ui/snap-rail'
import { Reveal } from '@/components/ui/reveal'
import { CityTile } from '@/components/features/home/cards'
import { InvitationCard, invitationFillCount } from '@/components/features/events/invitation-card'
import { CONTAINER, SECTION_RAIL } from '@/lib/ui/spacing'
import { RHYTHM_GAP, CITY_TILE_CELL } from '@/lib/ui/rhythm'
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
      const photo = await getCategoryPhoto(v.categorySlug, v.name)
      v.imageSrc = photo.src
      v.imageAlt = photo.alt
    }),
  )

  if (top.length === 0) return null

  return (
    <section aria-label="Featured venues" className={`border-t border-ink-200 bg-canvas ${SECTION_RAIL}`}>
      <Reveal className={CONTAINER}>
        <SnapRail
          eyebrow="Featured venues"
          title="Where the city goes"
          headerLink={{ href: '/events', label: 'View all' }}
          railLabel="Featured venues"
          containerBg="canvas"
          cardGap={RHYTHM_GAP}
        >
          {top.map(v => (
            <div key={v.name} className={CITY_TILE_CELL}>
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
          {/* Sparse-rail discipline (same law as every event rail): a thin
              venues rail tops up with invitation cards so it reads full and
              balanced, never a near-empty track. They match the CityTile cell
              width and fill its height (fitParent), and vanish once five or
              more real venues fill the rail. */}
          {Array.from({ length: invitationFillCount(top.length) }, (_, i) => (
            <div key={`invite-${i}`} className={CITY_TILE_CELL}>
              <InvitationCard
                fitParent
                variant="landscape"
                angle={i === 1 ? 'performer' : 'organiser'}
                subject="live"
              />
            </div>
          ))}
        </SnapRail>
      </Reveal>
    </section>
  )
}
