'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Heart, MapPin } from 'lucide-react'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import type { EventInventory } from '@/lib/redis/inventory-cache'

/**
 * EventCard — spec §6.2
 *
 * Layout:
 *   - Image: 16:9 mobile (edge-to-edge in grid), 4:3 on md+ (desktop grid)
 *   - Category pill: absolute top-left overlay on image
 *   - Heart/save button: absolute bottom-right of image
 *   - Card body: date (gold), title (Manrope), location, price + social proof
 *
 * Price: "From AUD $X" — Manrope 700, no decimal for round cents
 * Social proof badge: coral for trending, gold for near-sold-out (§6.2 spec)
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
}

type Props = {
  event: EventCardData
  dynamicPrices?: Map<string, number>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatPrice(
  tiers: EventCardTier[],
  dynamicPrices: Map<string, number>,
): string {
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

export function EventCard({ event, dynamicPrices = new Map() }: Props) {
  const {
    slug, title, cover_image_url, start_date,
    venue_city, venue_country, created_at, category, ticket_tiers,
  } = event

  const priceLabel = formatPrice(ticket_tiers, dynamicPrices)
  const inventory  = ticket_tiers.length > 0 ? buildInventory(ticket_tiers) : null

  // Location display: city if available, else country
  const location = venue_city
    ? venue_city
    : venue_country ?? null

  return (
    <Link
      href={`/events/${slug}`}
      className="group flex flex-col rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow border border-ink-100"
    >
      {/* ── Image ───────────────────────────────────────────────── */}
      <div className="relative aspect-video md:aspect-[4/3] overflow-hidden bg-ink-100">
        {cover_image_url ? (
          <Image
            src={cover_image_url}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-200">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Category pill — top-left overlay */}
        {category && (
          <span className="absolute left-3 top-3 rounded-full bg-ink-900/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            {category.name}
          </span>
        )}

        {/* Heart / save — bottom-right overlay */}
        <button
          type="button"
          aria-label={`Save ${title}`}
          onClick={(e) => {
            e.preventDefault()
            // Save/unsave logic wired in Session 4
          }}
          className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/40 transition-colors min-h-[44px] min-w-[44px] -mb-[8px] -mr-[8px]"
        >
          <Heart className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* ── Card body ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-4">
        {/* Date */}
        <p className="font-display text-xs font-semibold text-gold-500">
          {formatDate(start_date)}
        </p>

        {/* Title */}
        <h3 className="mt-1 font-display text-sm font-700 leading-snug text-ink-900 line-clamp-2 group-hover:text-gold-500 transition-colors">
          {title}
        </h3>

        {/* Location */}
        {location && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-400">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            {location}
          </p>
        )}

        {/* Price + social proof */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className="font-display text-sm font-bold text-ink-900">
            {priceLabel}
          </p>
          {inventory && (
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
