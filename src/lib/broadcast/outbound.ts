import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { validateExternalTicketUrl } from '@/lib/broadcast/external-destination'
import { getOrCreateShareLink, recordShareLinkEvent, resolveShareLink, visitorHash } from '@/lib/broadcast/share-links'
import { buttonOf, providerOf, type BookingLink } from '@/lib/events/booking-links'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { readListingPages } from '@/lib/listings/listing-pages-read'
import type { ListingPages } from '@/lib/listings/outbound'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * THE OUTBOUND PRESS: /out/[slug]?to=<destination>. Window 6, 27 October 2026, the project manager's 12:18 and 12:37 of
 * that day.
 *
 * Lawal, 27 October: "the event link doesn't show an outside event in full with one button to the other ticketing
 * site". Every button that leaves a listing takes its address from one function, src/lib/listings/outbound.ts
 * outboundHref, which window 2 left for this: "window 6's counted redirect ... changes this function and nothing else,
 * so every button is counted the day it lands". It now names this route and the destination the page chose, so every
 * press is counted before the visitor leaves: once they are on the other site, nothing that happens there is visible to
 * us (the same reason /e/[code] books an external click before its redirect, founder ruling 15 August 2026).
 *
 * NEVER AN OPEN REDIRECT. The destination named is followed only when it is one of THIS event's own: a live booking
 * link (WI3, event_booking_links), one of its host's pages as the page reads them (readListingPages: the host's site,
 * the series' post, the page the import last read), or its external ticket address. Anything else, or a link that went
 * dead between the page and the press, lands on the event's one button by WI3's own order (buttonOf), then its host's
 * first page, and with none of those, on the event page itself: never strand them.
 *
 * WHAT IS COUNTED. One share_link_events row of kind 'outbound' naming the booking link pressed (none for a host page)
 * and its platform (the 12:37: "the per-platform count ... comes from one row each"), on the share link the visitor
 * arrived by when that link is this event's (the el_share_code cookie), else on the event's own link for channel
 * 'other'. Never 'click', which is an arrival. Once per visitor per booking link per day, and never for a crawler.
 */

export type OutboundEvent = {
  id: string
  slug: string
  externalTicketUrl: string | null
  /** The listing fields readListingPages reads. */
  listing: Parameters<typeof readListingPages>[0]
}
export type OutboundLink = { id: string; event_id: string | null }
export type Destination = { url: string; bookingLinkId: string | null; provider: string }

export type OutboundDeps = {
  findEvent(slug: string): Promise<OutboundEvent | null>
  linksOf(eventId: string): Promise<BookingLink[]>
  pagesOf(event: OutboundEvent): Promise<ListingPages>
  /** The share link named by the visitor's last-touch cookie, if any. */
  arrivedBy(code: string | null): Promise<OutboundLink | null>
  /** The event's own share link for channel 'other', minted on first need. */
  ownLink(event: OutboundEvent): Promise<OutboundLink | null>
  record(linkId: string, visitor: string | null, pressed: { bookingLinkId: string | null; provider: string }): Promise<void>
  counting(): Promise<boolean>
}

export type OutboundAnswer =
  | { kind: 'out'; location: string; bookingLinkId: string | null; counted: boolean }
  | { kind: 'page'; location: string }
  | { kind: 'missing' }

const same = (a: string, b: string) => a.trim() === b.trim()

/** Every place this event may send a visitor, the one button first. */
export function destinationsOf(links: readonly BookingLink[], pages: ListingPages, externalTicketUrl: string | null): Destination[] {
  const live = links.filter((l) => l.availability !== 'dead')
  const button = buttonOf(links)
  const ordered = button ? [button, ...live.filter((l) => l.id !== button.id)] : live
  const out: Destination[] = ordered.map((l) => ({ url: l.url, bookingLinkId: l.id, provider: l.provider }))
  for (const url of [pages.sourceUrl, pages.websiteUrl, pages.instagramPostUrl, pages.checkedUrl, externalTicketUrl]) {
    if (typeof url === 'string' && url.trim() !== '' && !out.some((d) => same(d.url, url))) {
      out.push({ url: url.trim(), bookingLinkId: null, provider: providerOf(url.trim()) })
    }
  }
  return out
}

/** Decides a press: where it goes, and on which link it is counted. Pure over its deps, so the rules are tested alone. */
export async function followOutbound(
  input: { slug: string; to: string | null; cookieCode: string | null; userAgent: string | null; ip: string | null },
  deps: OutboundDeps,
): Promise<OutboundAnswer> {
  const event = await deps.findEvent(input.slug)
  if (!event) return { kind: 'missing' }
  const [links, pages] = await Promise.all([deps.linksOf(event.id), deps.pagesOf(event)])
  const valid = destinationsOf(links, pages, event.externalTicketUrl).filter((d) => validateExternalTicketUrl(d.url).ok)
  const pressed = (input.to ? valid.find((d) => same(d.url, input.to as string)) : undefined) ?? valid[0]
  if (!pressed) return { kind: 'page', location: `/events/${event.slug}` }
  const checked = validateExternalTicketUrl(pressed.url)
  if (!checked.ok) return { kind: 'page', location: `/events/${event.slug}` }

  let counted = false
  try {
    if (!isPreviewCrawler(input.userAgent) && (await deps.counting())) {
      const arrived = await deps.arrivedBy(input.cookieCode)
      const link = arrived && arrived.event_id === event.id ? arrived : await deps.ownLink(event)
      if (link) {
        await deps.record(link.id, visitorHash(input.ip, input.userAgent), { bookingLinkId: pressed.bookingLinkId, provider: pressed.provider })
        counted = true
      }
    }
  } catch (err) {
    // A lost count is a lost row, never a stranded visitor; the reason is kept in the log.
    console.warn('[outbound] the press was not counted', err instanceof Error ? err.message : String(err))
  }
  return { kind: 'out', location: checked.url, bookingLinkId: pressed.bookingLinkId, counted }
}

/** The deps as the platform holds them. */
export function outboundDeps(): OutboundDeps {
  const admin = createAdminClient()
  return {
    async findEvent(slug) {
      const row = await readOrThrow('outbound press event', () =>
        applyPublicEventVisibility(
          admin
            .from('events')
            .select('id, slug, status, visibility, entry_mode, listing_source, listing_series_id, external_ticket_url')
            .eq('slug', slug),
          { includeExternal: true },
        )
          .limit(1)
          .maybeSingle(),
      )
      if (!row?.id || !row.slug) return null
      return { id: row.id, slug: row.slug, externalTicketUrl: row.external_ticket_url ?? null, listing: row }
    },
    async linksOf(eventId) {
      const rows = await readOrThrow('outbound press booking links', () =>
        admin
          .from('event_booking_links')
          .select('id, provider, url, kind, availability, price_from_cents, price_checked_at, is_primary, set_by, pointed_to_by_organiser, position, created_at')
          .eq('event_id', eventId)
          .limit(50),
      )
      return (rows ?? []).map((r) => ({
        id: r.id,
        provider: r.provider as BookingLink['provider'],
        url: r.url,
        kind: r.kind as BookingLink['kind'],
        availability: r.availability as BookingLink['availability'],
        priceFromCents: r.price_from_cents,
        priceCheckedAt: r.price_checked_at,
        isPrimary: r.is_primary,
        setBy: r.set_by as BookingLink['setBy'],
        pointedToByOrganiser: r.pointed_to_by_organiser,
        position: r.position,
        createdAt: r.created_at,
      }))
    },
    pagesOf: (event) => readListingPages(event.listing),
    async arrivedBy(code) {
      if (!code) return null
      const link = await resolveShareLink(code)
      return link ? { id: link.id, event_id: link.event_id } : null
    },
    async ownLink(event) {
      const link = await getOrCreateShareLink({ eventId: event.id, channel: 'other', eventSlug: event.slug })
      return link ? { id: link.id, event_id: link.event_id } : null
    },
    async record(linkId, visitor, pressed) {
      await recordShareLinkEvent({ linkId, kind: 'outbound', visitorHash: visitor, outbound: pressed })
    },
    counting: () => isFeatureEnabled('broadcast_share'),
  }
}
