import Link from 'next/link'
import { EventCardMedia, BrandedPlaceholder } from '@/components/media'
import { getEventMedia, type EventMediaInput } from '@/lib/images/event-media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { BentoEvent } from './event-bento-tile'

/**
 * FreeWeekendTile: bento cell that highlights the highest-capacity free
 * event this weekend. Falls back to "Discover free events" generic CTA
 * when no free-weekend event exists.
 *
 * Separated-card pattern (rebuilt batch 3):
 *   - Image at TOP (3/2 aspect) with gold "Free" pill on a darkened
 *     gradient label band along the lower edge of the image.
 *   - White card body BELOW the image with date / title / venue / CTA.
 *   - 8px radius, hover lift + shadow.
 */

interface Props {
  event: BentoEvent | null
  /** When true, the tile shows a discovery CTA with Pexels photography. */
  fallbackMode?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

interface ResolvedTileMedia {
  imageSrc: string | null
  imageAlt: string
  placeholderCategory: string | null
}

function resolveTileMedia(
  fallbackAlt: string,
  media: Awaited<ReturnType<typeof getEventMedia>>,
): ResolvedTileMedia {
  if (media.kind === 'video') {
    return { imageSrc: media.poster, imageAlt: fallbackAlt, placeholderCategory: null }
  }
  if (media.kind === 'carousel') {
    return {
      imageSrc: media.images[0] ?? null,
      imageAlt: media.alts[0] ?? fallbackAlt,
      placeholderCategory: null,
    }
  }
  if (media.kind === 'still-kenburns') {
    return { imageSrc: media.src, imageAlt: media.alt ?? fallbackAlt, placeholderCategory: null }
  }
  return { imageSrc: null, imageAlt: fallbackAlt, placeholderCategory: media.category }
}

export async function FreeWeekendTile({ event, fallbackMode = false }: Props) {
  let mediaInput: EventMediaInput | null = event
  if (!mediaInput || fallbackMode) {
    const photo = await getCategoryPhoto('festival')
    mediaInput = {
      title: 'Free this weekend',
      cover_image_url: photo.src,
      category: { slug: 'festival', name: 'Free entry' },
    }
  }

  const media = await getEventMedia(mediaInput)
  const fallbackAlt = event?.title ?? 'Free this weekend'
  const { imageSrc, imageAlt, placeholderCategory } = resolveTileMedia(fallbackAlt, media)
  const href = event ? `/events/${event.slug}` : '/events?free=1'
  const title = event?.title ?? 'Free this weekend'
  const venue = event
    ? [event.venue_name, event.venue_city].filter(Boolean).join(' \u00B7 ')
    : 'Find events that cost nothing but your Saturday'

  return (
    <Link
      href={href}
      className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--surface-1)]">
        {imageSrc ? (
          <EventCardMedia src={imageSrc} alt={imageAlt} variant="bento-supporting" />
        ) : (
          <BrandedPlaceholder category={placeholderCategory} />
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.7) 100%)',
          }}
          aria-hidden
        />
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[var(--color-gold-400)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-navy-950)] shadow-sm">
          Free
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {event && (
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
            {formatDate(event.start_date)}
          </p>
        )}
        <h3 className="mt-1 font-display text-base font-extrabold leading-tight text-[var(--text-primary)] line-clamp-2">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-2">
          {venue}
        </p>
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[11px] font-semibold text-[var(--brand-accent-strong)] transition-transform duration-200 group-hover:translate-x-0.5">
          {event ? 'RSVP' : 'Find free'} <span aria-hidden>&rarr;</span>
        </span>
      </div>
    </Link>
  )
}
