import Link from 'next/link'
import { EventCardMedia, BrandedPlaceholder } from '@/components/media'
import { GlassCard } from '@/components/ui/glass-card'
import { getEventMedia, type EventMediaInput } from '@/lib/images/event-media'
import { getCategoryPhoto } from '@/lib/images/category-photo'
import type { BentoEvent } from './event-bento-tile'

/**
 * FreeWeekendTile: bento cell that highlights the highest-capacity free
 * event this weekend. Falls back to "Discover free events" generic CTA
 * when no free-weekend event exists.
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
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-ink-900 tile-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
      aria-label={event ? `Free: ${event.title}` : 'Browse free events'}
    >
      <div className="absolute inset-0">
        <div className="absolute inset-0 overflow-hidden transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]">
          {imageSrc ? (
            <EventCardMedia src={imageSrc} alt={imageAlt} variant="bento-hero" />
          ) : (
            <BrandedPlaceholder category={placeholderCategory} />
          )}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.2) 45%, rgba(10,22,40,0.9) 100%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-transparent transition-colors duration-300 group-hover:border-gold-400/70"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex items-start justify-between p-4">
        <GlassCard
          variant="dark"
          className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-gold-400"
        >
          Free
        </GlassCard>
      </div>

      <div className="flex-1" />

      <div className="relative z-10 p-4 text-white">
        {event && (
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-400">
            {formatDate(event.start_date)}
          </p>
        )}
        <h3 className="mt-1 font-display text-lg font-extrabold leading-tight line-clamp-2">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-white/75 line-clamp-2">{venue}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-gold-400 transition-transform duration-300 group-hover:translate-x-1">
          {event ? 'RSVP' : 'Find free'} <span aria-hidden>&rarr;</span>
        </span>
      </div>
    </Link>
  )
}
