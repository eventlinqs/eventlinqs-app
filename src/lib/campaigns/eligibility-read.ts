import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { ctaStateOf } from '@/lib/events/cta'
import { computeFeeLineCents } from '@/lib/payments/fee-math'
import { getLivePublicFee } from '@/lib/pricing/live-fee'
import { usableImages } from '@/lib/social/store'
import { venueMediaDeps } from '@/lib/venues/venue-images'
import { eventCoversFor } from '@/lib/venues/venue-photos-read'
import { judgeEvent, type EligibilityJudgement } from './eligibility'

/** The rows behind the eligibility engine (./eligibility.ts): every public night in the directive's 90 days. */

const HORIZON_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const READ_LIMIT = 1000

type TierRow = { price: number; total_capacity: number; sold_count: number; reserved_count: number; is_active: boolean }

export type JudgedEvent = EligibilityJudgement & { readonly eventId: string; readonly slug: string; readonly title: string; readonly startDate: string }
export type EligibilityReport = {
  readonly events: readonly JudgedEvent[]
  /** True when the nights' dealt venue photographs could not be read, so a venue photograph counted for nothing in this reading. */
  readonly venuePhotosUnread: boolean
}

export async function readEligibility(now: Date = new Date()): Promise<EligibilityReport> {
  const db = createAdminClient()
  const { data, error } = await applyPublicEventVisibility(
    db
      .from('events')
      .select(
        'id, slug, title, start_date, end_date, status, visibility, venue_id, venue_name, venue_city, category_id, is_free, entry_mode, external_ticket_url, ticket_tiers(price, total_capacity, sold_count, reserved_count, is_active), event_booking_links(availability)',
      ),
    { now, includeExternal: true },
  )
    .gt('end_date', now.toISOString())
    .lte('start_date', new Date(now.getTime() + HORIZON_DAYS * DAY_MS).toISOString())
    .order('start_date', { ascending: true })
    .limit(READ_LIMIT)
  if (error) throw new Error(`the nights could not be read: ${error.message}`)
  const rows = (data ?? []) as unknown as Record<string, unknown>[]

  const owned = await usableImages(db, rows.map((r) => r.id as string), now)
  let venuePhotosUnread = false
  let venuePhotos = new Map<string, unknown>()
  try {
    venuePhotos = await eventCoversFor(rows.map((r) => r.id as string), 'event_card', venueMediaDeps())
  } catch {
    venuePhotosUnread = true
  }
  const fee = await getLivePublicFee()

  const events = rows.map((r): JudgedEvent => {
    const tiers = ((r.ticket_tiers as TierRow[] | null) ?? []).filter((t) => t.is_active)
    const links = (r.event_booking_links as { availability: string }[] | null) ?? []
    const left = tiers.reduce((n, t) => n + Math.max(0, t.total_capacity - t.sold_count - t.reserved_count), 0)
    const subtotal = tiers.reduce((n, t) => n + Math.max(0, t.total_capacity - t.sold_count - t.reserved_count) * t.price, 0)
    const liveLinks = links.filter((l) => l.availability !== 'dead')
    const judged = judgeEvent(
      {
        status: r.status as string,
        visibility: r.visibility as string,
        startDate: r.start_date as string,
        endDate: r.end_date as string,
        venueName: (r.venue_name as string | null) ?? null,
        city: (r.venue_city as string | null) ?? null,
        categoryKnown: Boolean(r.category_id),
        ctaState: ctaStateOf({
          entryMode: (r.entry_mode as string | null) ?? null,
          tiers,
          isFree: (r.is_free as boolean | null) ?? null,
          externalTicketUrl: (r.external_ticket_url as string | null) ?? null,
        }),
        destinationDead: tiers.length === 0 && links.length > 0 && liveLinks.length === 0,
        soldOut:
          tiers.length > 0 ? left <= 0 : liveLinks.length > 0 && !liveLinks.some((l) => l.availability === 'on_sale' || l.availability === 'not_yet'),
        media: owned.has(r.id as string) ? 'organiser' : venuePhotos.has(r.id as string) ? 'venue' : null,
        potentialFeeCents:
          tiers.length === 0
            ? null
            : computeFeeLineCents(subtotal, left, { platformFeePercent: fee.percent, platformFeeFixedCents: fee.fixedCents }).platform_fee_cents,
      },
      now,
    )
    return { ...judged, eventId: r.id as string, slug: r.slug as string, title: r.title as string, startDate: r.start_date as string }
  })
  return { events, venuePhotosUnread }
}
