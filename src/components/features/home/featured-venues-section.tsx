import Link from 'next/link'
import { SnapRail } from '@/components/ui/snap-rail'
import { CONTAINER, SECTION_TIGHT } from '@/lib/ui/spacing'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import { EventCardMedia, BrandedPlaceholder } from '@/components/media'
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
    <section aria-label="Featured venues" className={`bg-canvas ${SECTION_TIGHT}`}>
      <div className={CONTAINER}>
        <SnapRail
          eyebrow="Featured venues"
          title="Where the city goes"
          headerLink={{ href: '/events', label: 'View all' }}
          railLabel="Featured venues"
          containerBg="canvas"
        >
          {top.map(v => (
            <Link
              key={v.name}
              href={`/events?venue=${encodeURIComponent(v.name)}`}
              className="group flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 sm:w-[280px]"
            >
              <div className="relative aspect-[3/2] overflow-hidden bg-[var(--surface-1)]">
                {v.imageSrc ? (
                  <EventCardMedia src={v.imageSrc} alt={v.imageAlt ?? v.name} variant="rail" />
                ) : (
                  <BrandedPlaceholder category={v.categorySlug} />
                )}
                <div
                  className="absolute inset-x-0 bottom-0 h-2/5"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.85) 100%)',
                  }}
                  aria-hidden
                />
                <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
                  <h3 className="font-display text-lg font-extrabold leading-tight text-white line-clamp-1">
                    {v.name}
                  </h3>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                  {v.city ? `${v.city} \u00B7 ${v.count} ${v.count === 1 ? 'event' : 'events'}` : `${v.count} ${v.count === 1 ? 'event' : 'events'}`}
                </p>
                <span
                  className="text-[var(--text-muted)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--brand-accent-strong)]"
                  aria-hidden
                >
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </SnapRail>
      </div>
    </section>
  )
}
