import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { validateExternalTicketUrl } from '@/lib/broadcast/external-destination'
import { getOrCreateShareLink, recordShareLinkEvent, resolveShareLink, visitorHash } from '@/lib/broadcast/share-links'
import { buttonOf, type BookingLink } from '@/lib/events/booking-links'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * THE OUTBOUND PRESS: /out/[slug]?l=<link id>. Window 6, 27 October 2026, the project manager's 12:18 and 12:37 of that
 * day.
 *
 * Lawal, 27 October: "the event link doesn't show an outside event in full with one button to the other ticketing
 * site". A curated listing carries one clear button to the organiser's own page or booking site, and an "Also on" line
 * for the other places it sells (WI3, event_booking_links). Every one of those goes through here, so each press is
 * counted before the visitor leaves: once they are on the other site, nothing that happens there is visible to us (the
 * same reason /e/[code] books an external click before its redirect, founder ruling 15 August 2026).
 *
 * WHICH LINK. The one named by ?l=, when it is this event's and not dead; otherwise the one big button's, by WI3's own
 * order (buttonOf, the same order as the database's event_booking_button). A link that went dead between the page and
 * the press therefore still lands the visitor on a live one.
 *
 * WHAT IS COUNTED, AND ON WHICH ROW. One share_link_events row of kind 'outbound' naming the booking link pressed and
 * its provider (the 12:37: "the per-platform count ... comes from one row each"), on the share link the visitor arrived
 * by when that link is this event's (the el_share_code cookie, so the press is credited to the channel that brought
 * them), else on the event's own link for channel 'other'. A new kind, never 'click': 'click' is an ARRIVAL through a
 * link, and an organiser reading their reach panel must not see people leaving counted as people arriving. Once per
 * visitor per booking link per day, as clicks are once per visitor per link per day, and never for a preview crawler.
 *
 * WHERE IT GOES. The link's own address, validated by the rule /e/[code] uses on every hop (https, not our own host,
 * length bounded). An event the public cannot see answers missing; one with no live, valid link sends the visitor to
 * the event page instead of to an error: never strand them.
 */

export type OutboundEvent = { id: string; slug: string }
export type OutboundLink = { id: string; event_id: string | null }

export type OutboundDeps = {
  findEvent(slug: string): Promise<OutboundEvent | null>
  linksOf(eventId: string): Promise<BookingLink[]>
  /** The share link named by the visitor's last-touch cookie, if any. */
  arrivedBy(code: string | null): Promise<OutboundLink | null>
  /** The event's own share link for channel 'other', minted on first need. */
  ownLink(event: OutboundEvent): Promise<OutboundLink | null>
  record(linkId: string, visitor: string | null, pressed: { bookingLinkId: string; provider: string }): Promise<void>
  counting(): Promise<boolean>
}

export type OutboundAnswer =
  | { kind: 'out'; location: string; bookingLinkId: string; counted: boolean }
  | { kind: 'page'; location: string }
  | { kind: 'missing' }

/** Decides a press: where it goes, and on which link it is counted. Pure over its deps, so the rules are tested alone. */
export async function followOutbound(
  input: { slug: string; linkId: string | null; cookieCode: string | null; userAgent: string | null; ip: string | null },
  deps: OutboundDeps,
): Promise<OutboundAnswer> {
  const event = await deps.findEvent(input.slug)
  if (!event) return { kind: 'missing' }
  const links = await deps.linksOf(event.id)
  const named = input.linkId ? links.find((l) => l.id === input.linkId && l.availability !== 'dead') : undefined
  const pressed = named ?? buttonOf(links)
  const checked = pressed ? validateExternalTicketUrl(pressed.url) : null
  if (!pressed || !checked || !checked.ok) return { kind: 'page', location: `/events/${event.slug}` }

  let counted = false
  try {
    if (!isPreviewCrawler(input.userAgent) && (await deps.counting())) {
      const arrived = await deps.arrivedBy(input.cookieCode)
      const link = arrived && arrived.event_id === event.id ? arrived : await deps.ownLink(event)
      if (link) {
        await deps.record(link.id, visitorHash(input.ip, input.userAgent), { bookingLinkId: pressed.id, provider: pressed.provider })
        counted = true
      }
    }
  } catch {
    // A lost count is a lost row, never a stranded visitor.
  }
  return { kind: 'out', location: checked.url, bookingLinkId: pressed.id, counted }
}

/** The deps as the platform holds them. */
export function outboundDeps(): OutboundDeps {
  const admin = createAdminClient()
  return {
    async findEvent(slug) {
      const row = await readOrThrow('outbound press event', () =>
        applyPublicEventVisibility(admin.from('events').select('id, slug').eq('slug', slug), { includeExternal: true })
          .limit(1)
          .maybeSingle(),
      )
      return row?.id && row.slug ? { id: row.id, slug: row.slug } : null
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
