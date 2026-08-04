import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import { CityTileImage } from '@/components/media/CityTileImage'
import { CategoryTileImage } from '@/components/media/CategoryTileImage'

/**
 * Home card system (Phase 1).
 *
 * One family of separated cards for the homepage rails. The rule, taken
 * from Ticketmaster, Eventbrite and DICE: the image stands alone - nothing
 * sits on top of it - and the details (label, title, meta) sit BELOW the
 * image. The whole card is a single link.
 *
 * Finish is luxury-grade and quiet: a considered 16px radius, a hairline
 * border, a soft resting shadow that deepens on a restrained hover lift,
 * and internal spacing that is generous but tight. Title is the Archivo
 * headline; label and meta inherit the UI/body faces. Colours and spacing
 * come only from the locked tokens (navy, gold, surface, ink) - no new
 * values.
 *
 * Imagery flows through EventCardMedia (Next Image, AVIF, correct sizes,
 * lazy by default, priority opt-in for above-the-fold). No bg-image, no
 * raw <img>, no text burned onto the photograph.
 */

export interface HomeCardEvent {
  href: string
  imageSrc: string
  alt: string
  /** Small group label above the title: genre, community, or event type. */
  label: string
  title: string
  venue: string
  city: string
  /** Pre-formatted AU date, e.g. "Sat 14 Mar 2026". */
  dateLabel: string
  /** Pre-formatted price, e.g. "From AUD $55" or "Free". */
  priceLabel: string
  /** Opt into priority image loading - above-the-fold cards only. */
  priority?: boolean
}

export interface CityTileData {
  href: string
  imageSrc: string
  alt: string
  name: string
  /** e.g. "32 events". */
  metaLabel: string
  priority?: boolean
  /** Focal point for the cover crop (spine slot imagery). */
  objectPosition?: string
}

// Shared finish. Quiet confidence: hairline border + soft shadow, a small
// hover lift, gold focus ring with offset.
// h-full: every card fills its rail/grid cell so cards in one rail share a
// single height. The flex track (and grid rows) stretch cells to the tallest
// item; without h-full a shorter card top-aligns and leaves dead space beneath
// it. With it, every card's footer baseline lines up and the rail reads as one
// symmetrical grid (founder rail-symmetry law). Body uses flex-1 + mt-auto so
// the extra height opens above the footer, never below the card.
const SURFACE =
  'group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] ' +
  'shadow-[0_1px_3px_rgba(10,22,40,0.05)] transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(10,22,40,0.13)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'
const IMG_WRAP = 'relative overflow-hidden bg-[var(--surface-1)]'
// Inner-media zoom tuned to the raised Motion bar: 1.03 scale at ~200ms ease-out
// (was 1.05 / 700ms), so the lift + shadow + zoom read as one quick, premium
// gesture rather than a slow drift. Reduced-motion holds the image still.
const IMG_MOTION =
  'transition-transform duration-200 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100'
const LABEL =
  'font-display text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]'
const TITLE =
  'font-headline font-bold leading-snug tracking-tight text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]'
const DATE = 'font-semibold uppercase tracking-wide text-[var(--brand-accent-strong)]'
const PRICE = 'font-headline font-bold text-[var(--text-primary)]'

/** 1. Standard landscape event card (default rail card). */
export function EventCardLandscape({ event }: { event: HomeCardEvent }) {
  return (
    <Link href={event.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-[16/10]`}>
        <EventCardMedia src={event.imageSrc} alt={event.alt} variant="card" priority={event.priority} className={IMG_MOTION} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className={LABEL}>{event.label}</p>
        <h3 className={`mt-1.5 line-clamp-2 text-lg ${TITLE}`}>{event.title}</h3>
        <p className="mt-1.5 line-clamp-1 text-sm text-[var(--text-secondary)]">
          {event.venue} &middot; {event.city}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <span className={`text-xs ${DATE}`}>{event.dateLabel}</span>
          <span className={`text-sm ${PRICE}`}>{event.priceLabel}</span>
        </div>
      </div>
    </Link>
  )
}

/** 2. Compact square tile (genre and trending rails). */
export function EventCardSquare({ event }: { event: HomeCardEvent }) {
  return (
    <Link href={event.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-square`}>
        <EventCardMedia src={event.imageSrc} alt={event.alt} variant="rail" priority={event.priority} className={IMG_MOTION} />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className={LABEL}>{event.label}</p>
        <h3 className={`mt-1 line-clamp-2 text-sm ${TITLE}`}>{event.title}</h3>
        <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{event.city}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className={`text-[11px] ${DATE}`}>{event.dateLabel}</span>
          <span className={`text-xs ${PRICE}`}>{event.priceLabel}</span>
        </div>
      </div>
    </Link>
  )
}

/** 3. Wide feature card (lead item in a rail). */
export function EventCardFeature({ event, blurb }: { event: HomeCardEvent; blurb?: string }) {
  return (
    <Link href={event.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-[16/9]`}>
        <EventCardMedia src={event.imageSrc} alt={event.alt} variant="card" priority={event.priority ?? true} className={IMG_MOTION} />
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className={LABEL}>{event.label}</p>
        <h3 className={`mt-2 line-clamp-2 text-2xl sm:text-3xl ${TITLE}`}>{event.title}</h3>
        {blurb ? (
          <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)] sm:text-base">{blurb}</p>
        ) : null}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {event.venue} &middot; {event.city}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={`text-sm ${DATE}`}>{event.dateLabel}</span>
          <span className={`text-base ${PRICE}`}>{event.priceLabel}</span>
        </div>
      </div>
    </Link>
  )
}

export interface CommunityTileData {
  href: string
  /** Community hero photo URL, or null - null routes to the branded placeholder. */
  imageSrc: string | null
  alt: string
  name: string
  /** e.g. "32 events" or "Be the first". */
  metaLabel: string
  priority?: boolean
  /** Focal point for the cover crop (spine slot imagery). */
  objectPosition?: string
}

/**
 * Community tile - the homepage "Find your community" rail + value band tile.
 * A heritage community in the locked separated-card system: a portrait
 * photograph that stands alone (hover illumination + branded fallback via
 * EventCardMedia), the community name and event count BELOW it, never on the
 * image. Links to the real /community/[slug] landing.
 */
export function CommunityTile({ community }: { community: CommunityTileData }) {
  return (
    <Link href={community.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-[4/5]`}>
        <EventCardMedia
          src={community.imageSrc ?? ''}
          alt={community.alt}
          variant="card"
          priority={community.priority}
          objectPosition={community.objectPosition}
          className={IMG_MOTION}
        />
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 p-4">
        <span className={`text-base ${TITLE}`}>{community.name}</span>
        <span className="shrink-0 text-xs text-[var(--text-secondary)]">{community.metaLabel}</span>
      </div>
    </Link>
  )
}

/** 4. City tile - image with the city name BELOW it, never on it. */
export function CityTile({ city }: { city: CityTileData }) {
  return (
    <Link href={city.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-[3/2]`}>
        <CityTileImage src={city.imageSrc} alt={city.alt} priority={city.priority} objectPosition={city.objectPosition} className={IMG_MOTION} />
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 p-4">
        <span className={`text-lg ${TITLE}`}>{city.name}</span>
        <span className="text-xs text-[var(--text-secondary)]">{city.metaLabel}</span>
      </div>
    </Link>
  )
}

export interface CategoryTileData {
  href: string
  imageSrc: string
  alt: string
  name: string
  /** e.g. "24 events" or "Explore". */
  metaLabel: string
  priority?: boolean
  /** Focal point for the cover crop (spine slot imagery). */
  objectPosition?: string
}

/**
 * 5. Category tile - the homepage category entry, replacing the old pill
 * strip. Same separated-tile finish as CityTile: a representative photo in a
 * 3/2 frame with the category name and a small meta BELOW it, never on the
 * image. Image flows through CategoryTileImage. This is the Ticketmaster
 * "Discover" / Eventbrite category-browse job, built in the locked system.
 */
export function CategoryTile({ category }: { category: CategoryTileData }) {
  return (
    <Link href={category.href} prefetch={false} className={`flex w-full flex-col ${SURFACE}`}>
      <div className={`${IMG_WRAP} aspect-[3/2]`}>
        <CategoryTileImage src={category.imageSrc} alt={category.alt} priority={category.priority} objectPosition={category.objectPosition} className={IMG_MOTION} />
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 p-4">
        <span className={`text-lg ${TITLE}`}>{category.name}</span>
        <span className="text-xs text-[var(--text-secondary)]">{category.metaLabel}</span>
      </div>
    </Link>
  )
}

/** Loading skeleton, shape-matched to the landscape card. */
export function CardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)]"
    >
      <div className="aspect-[16/10] animate-pulse bg-[var(--surface-1)]" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-1)]" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-1)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-1)]" />
      </div>
    </div>
  )
}

/** Empty state, shaped like a card so a rail/grid slot never collapses. */
export function CardEmptyState({
  title = 'No events here yet',
  body = 'Check back soon, or browse everything on now.',
  href = '/events',
  cta = 'Browse all events',
}: {
  title?: string
  body?: string
  href?: string
  cta?: string
}) {
  return (
    <div className="flex w-full flex-col items-start justify-center gap-2 rounded-2xl border border-dashed border-[var(--surface-2)] bg-[var(--surface-0)] p-6">
      <p className="font-headline text-base font-bold text-[var(--text-primary)]">{title}</p>
      <p className="text-sm text-[var(--text-secondary)]">{body}</p>
      <Link
        href={href}
        prefetch={false}
        className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-[var(--color-navy-950)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-ink-900)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
      >
        {cta}
      </Link>
    </div>
  )
}
