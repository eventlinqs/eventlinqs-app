'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { EventCardMedia, type EventCardMediaVariant } from '@/components/media'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { SaveEventButton } from './save-event-button'
import type { EventInventory } from '@/lib/redis/inventory-cache'
import type { SocialProofBadge as M5Badge } from '@/lib/events/types'
import { BADGE_LABELS, BADGE_STYLES } from '@/lib/events/badges'

/**
 * EventCard - spec §6.2
 *
 * Layout:
 *   - Image: 16:9 mobile (edge-to-edge in grid), 4:3 on md+ (desktop grid)
 *   - Category pill: absolute top-left overlay on image
 *   - Heart/save button: absolute bottom-right of image
 *   - Card body: date (gold), title (Manrope), location, price + social proof
 *
 * Price: "From AUD $X" - Manrope 700, no decimal for round cents
 *
 * M5 mode: when `event.badge` is explicitly provided (non-undefined),
 * the card shows the M5 single-priority social-proof badge top-left
 * (replacing the category pill) and renders the organisation name above
 * the title instead of the bottom inventory chip.
 */

export type EventCardTier = {
  id: string
  price: number
  currency: string
  sold_count: number
  reserved_count: number
  total_capacity: number
}

export type EventCardData = {
  id: string
  slug: string
  title: string
  cover_image_url: string | null
  thumbnail_url: string | null
  start_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  created_at: string
  category: { name: string; slug: string } | null
  ticket_tiers: EventCardTier[]
  is_free?: boolean | null
  organisation?: { name: string; slug?: string } | null
  badge?: M5Badge | null
}

type Props = {
  event: EventCardData
  dynamicPrices?: Map<string, number>
  initiallySaved?: boolean
  priority?: boolean
  /**
   * Layout context. Drives the underlying EventCardMedia variant so the
   * srcset hint matches the actual rendered width. Pass `"rail"` when the
   * card sits in a horizontal rail (fixed ~256-288px tile) so the browser
   * does not download a 750w image for a 254 CSS px slot.
   */
  variant?: Extract<EventCardMediaVariant, 'card' | 'rail'>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatPrice(
  tiers: EventCardTier[],
  dynamicPrices: Map<string, number>,
  isFree: boolean | null = null,
): string {
  if (isFree === true) return 'Free'
  if (!tiers || tiers.length === 0) return 'Free'
  const effectivePrices = tiers.map(t => dynamicPrices.get(t.id) ?? t.price)
  const min = Math.min(...effectivePrices)
  if (min === 0) return 'Free'
  const currency = tiers[0].currency ?? 'AUD'
  const dollars = min / 100
  const formatted = Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`
  return `From ${currency} ${formatted}`
}

function buildInventory(tiers: EventCardTier[]): EventInventory {
  const total_sold      = tiers.reduce((s, t) => s + t.sold_count, 0)
  const total_reserved  = tiers.reduce((s, t) => s + t.reserved_count, 0)
  const total_capacity  = tiers.reduce((s, t) => s + t.total_capacity, 0)
  const available       = Math.max(0, total_capacity - total_sold - total_reserved)
  const percent_sold    = total_capacity > 0
    ? Math.round((total_sold / total_capacity) * 100)
    : 0
  return { total_sold, total_reserved, total_capacity, available, percent_sold }
}

export function EventCard({ event, dynamicPrices = new Map(), initiallySaved = false, priority = false, variant = 'card' }: Props) {
  const {
    id, slug, title, cover_image_url, start_date,
    venue_city, venue_country, created_at, category, ticket_tiers,
    organisation, badge,
  } = event

  // M5 mode: caller explicitly attached a pre-computed `badge` (including
  // `null`, meaning "no badge for this event"). Disables the inventory
  // badge at the bottom and swaps the top-left pill.
  const m5Mode = 'badge' in event

  const priceLabel = formatPrice(ticket_tiers, dynamicPrices, event.is_free ?? null)
  const inventory  = ticket_tiers.length > 0 ? buildInventory(ticket_tiers) : null

  // Location display: city if available, else country
  const location = venue_city
    ? venue_city
    : venue_country ?? null

  return (
    <Link
      href={`/events/${slug}`}
      className="group flex flex-col rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow border border-ink-100"
    >
      {/* ── Image ───────────────────────────────────────────────── */}
      <div className="relative aspect-video md:aspect-[4/3] overflow-hidden bg-ink-100">
        {cover_image_url ? (
          <EventCardMedia
            src={cover_image_url}
            alt={title}
            variant={variant}
            priority={priority}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-200">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Top-left overlay: M5 badge (priority) or category pill. Exactly one renders. */}
        {m5Mode
          ? badge && (
              <span
                data-m5-badge={badge}
                className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${BADGE_STYLES[badge]}`}
              >
                {BADGE_LABELS[badge]}
              </span>
            )
          : category && (
              <span className="absolute left-3 top-3 rounded-full bg-ink-900/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {category.name}
              </span>
            )}

        {/* Heart / save - top-right overlay */}
        <SaveEventButton
          eventId={id}
          initiallySaved={initiallySaved}
          variant="light"
          className="absolute right-3 top-3 shadow-sm"
        />
      </div>

      {/* ── Card body ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-4">
        {m5Mode && organisation ? (
          <p className="text-xs font-medium text-ink-400">{organisation.name}</p>
        ) : (
          <p className="font-display text-xs font-semibold text-gold-700">
            {formatDate(start_date)}
          </p>
        )}

        {/* Title */}
        <h3 className="mt-1 font-display text-sm font-bold leading-snug text-ink-900 line-clamp-2 group-hover:text-gold-500 transition-colors">
          {title}
        </h3>

        {/* Date + location (single row in m5 mode) or just location */}
        {m5Mode ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{formatDate(start_date)}</span>
            {location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{location}</span>
              </>
            )}
          </p>
        ) : (
          location && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )
        )}

        {/* Price + social proof (inventory chip suppressed in M5 mode) */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className="font-display text-sm font-bold text-ink-900">
            {priceLabel}
          </p>
          {!m5Mode && inventory && (
            <SocialProofBadge
              inventory={inventory}
              createdAt={created_at}
              compact
            />
          )}
        </div>
      </div>
    </Link>
  )
}
