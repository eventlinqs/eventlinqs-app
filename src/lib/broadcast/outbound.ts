import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { validateExternalTicketUrl } from '@/lib/broadcast/external-destination'
import { getOrCreateShareLink, recordShareLinkEvent, resolveShareLink, visitorHash } from '@/lib/broadcast/share-links'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * THE OUTBOUND PRESS: /out/[slug]. Window 6, 27 October 2026, the project manager's 12:18 of that day.
 *
 * Lawal, 27 October: "the event link doesn't show an outside event in full with one button to the other ticketing
 * site". A curated listing carries one clear button to the organiser's own page or booking site. This is where that
 * button goes, so every press is counted before the visitor leaves: once they are on the other site, nothing that
 * happens there is visible to us (the same reason /e/[code] books an external click before its redirect, founder
 * ruling 15 August 2026).
 *
 * WHAT IS COUNTED, AND ON WHICH ROW. One share_link_events row of kind 'outbound', on the link the visitor arrived by
 * when that link is this event's (the el_share_code cookie, so the press is credited to the channel that brought
 * them), else on the event's own link for channel 'other'. A new kind, never 'click': 'click' is an ARRIVAL through a
 * link, and an organiser reading their reach panel must not see people leaving counted as people arriving. Once per
 * visitor per link per day, as clicks are (recordShareLinkEvent's de-duplication), and never for a preview crawler.
 *
 * WHERE IT GOES. The destination is read from the event at the moment of the press, never stored on a link, so a
 * changed booking site needs no link rewritten; it is validated by the same rule /e/[code] uses on every hop (https,
 * not our own host, length bounded). An event the public cannot see, or one with no valid destination, sends the
 * visitor to the event page instead of to an error: never strand them.
 */

export type OutboundEvent = { id: string; slug: string; destination: string | null }
export type OutboundLink = { id: string; event_id: string | null }

export type OutboundDeps = {
  findEvent(slug: string): Promise<OutboundEvent | null>
  /** The link named by the visitor's last-touch cookie, if any. */
  arrivedBy(code: string | null): Promise<OutboundLink | null>
  /** The event's own link for channel 'other', minted on first need. */
  ownLink(event: OutboundEvent): Promise<OutboundLink | null>
  record(linkId: string, visitor: string | null): Promise<void>
  counting(): Promise<boolean>
}

export type OutboundAnswer =
  | { kind: 'out'; location: string; counted: boolean }
  | { kind: 'page'; location: string }
  | { kind: 'missing' }

/** Decides a press: where it goes, and on which link it is counted. Pure over its deps, so the rules are tested alone. */
export async function followOutbound(
  input: { slug: string; cookieCode: string | null; userAgent: string | null; ip: string | null },
  deps: OutboundDeps,
): Promise<OutboundAnswer> {
  const event = await deps.findEvent(input.slug)
  if (!event) return { kind: 'missing' }
  const checked = validateExternalTicketUrl(event.destination)
  if (!checked.ok) return { kind: 'page', location: `/events/${event.slug}` }

  let counted = false
  try {
    if (!isPreviewCrawler(input.userAgent) && (await deps.counting())) {
      const arrived = await deps.arrivedBy(input.cookieCode)
      const link = arrived && arrived.event_id === event.id ? arrived : await deps.ownLink(event)
      if (link) {
        await deps.record(link.id, visitorHash(input.ip, input.userAgent))
        counted = true
      }
    }
  } catch {
    // A lost count is a lost row, never a stranded visitor.
  }
  return { kind: 'out', location: checked.url, counted }
}

/** The deps as the platform holds them. */
export function outboundDeps(): OutboundDeps {
  const admin = createAdminClient()
  return {
    async findEvent(slug) {
      const row = await readOrThrow('outbound press event', () =>
        applyPublicEventVisibility(admin.from('events').select('id, slug, external_ticket_url').eq('slug', slug), {
          includeExternal: true,
        })
          .limit(1)
          .maybeSingle(),
      )
      if (!row?.id || !row.slug) return null
      return { id: row.id, slug: row.slug, destination: typeof row.external_ticket_url === 'string' ? row.external_ticket_url : null }
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
    async record(linkId, visitor) {
      await recordShareLinkEvent({ linkId, kind: 'outbound', visitorHash: visitor })
    },
    counting: () => isFeatureEnabled('broadcast_share'),
  }
}
