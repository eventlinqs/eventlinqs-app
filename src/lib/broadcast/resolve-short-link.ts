import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { isValidShareCode } from '@/lib/broadcast/share-codes'
import { isValidReadableCode } from '@/lib/broadcast/short-links'
import { recordShareLinkEvent, resolveShareLink, visitorHash } from '@/lib/broadcast/share-links'

/**
 * Resolve a share code, and record the click.
 *
 * TWO OUTCOMES, because there are two kinds of link.
 *
 *   INTERNAL. The code belongs to an event on this platform. There is no
 *   redirect: the readable address IS the page. Eventbrite does not redirect,
 *   DICE does not redirect, Ticketmaster does not redirect. A redirect costs a
 *   round trip on a phone in a venue and needs a whole subsystem kept alive.
 *   /e/[code] renders the event page itself and books the click on the way
 *   through. UNCHANGED by the external work.
 *
 *   EXTERNAL. The code points at ticketing on another platform. Here a redirect
 *   is the entire point: the tracked link is ours and canonical so it can be
 *   printed and counted, and it hands the visitor onward to the box office that
 *   actually sells the ticket. Founder ruling 15 August 2026.
 *
 * BOTH code formats resolve in both cases. A readable code (basement-45-ig) and
 * a legacy random code (Rk9dW2xa1B) are both valid input, because a poster
 * already in a venue window carries the legacy form and must never break.
 */

export type ResolvedShortLink =
  | {
      kind: 'event'
      /** The event page to render. */
      slug: string
      /** The artist landing, when the link was minted for a tagged act. */
      artistSlug: string | null
      linkId: string
      code: string
    }
  | {
      kind: 'external'
      /** Where to send the visitor. Already https and validated at mint time. */
      destination: string
      linkId: string
      code: string
    }

/** Look up a code without recording anything. Format-gated before any query. */
export async function resolveShortCode(code: string): Promise<ResolvedShortLink | null> {
  if (!isValidShareCode(code) && !isValidReadableCode(code)) return null

  const link = await resolveShareLink(code)
  if (!link) return null

  /*
   * EXTERNAL FIRST. The database guarantees exactly one of event_id and
   * destination_url is set, so this ordering is a readability choice rather than
   * a precedence rule: there is no row where both could apply.
   */
  if (link.destination_url) {
    return {
      kind: 'external',
      destination: link.destination_url,
      linkId: link.id,
      code: link.code,
    }
  }

  if (!link.event_id) return null

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('slug, external_ticket_url')
    .eq('id', link.event_id)
    .maybeSingle()
  if (!event?.slug) return null

  /*
   * AN EVENT ROW THAT SELLS ELSEWHERE. This is the signed-in organiser case, as
   * distinct from the anonymous draft above. The destination is read from the
   * EVENT rather than stored on the link, so an organiser changing where their
   * tickets are sold does not require rewriting every link ever minted for them,
   * and a poster printed last month follows the change.
   */
  const externalUrl = event.external_ticket_url
  if (typeof externalUrl === 'string' && externalUrl.trim().length > 0) {
    return { kind: 'external', destination: externalUrl, linkId: link.id, code: link.code }
  }

  let artistSlug: string | null = null
  if (link.artist_id) {
    const { data: artist } = await admin
      .from('artists')
      .select('slug')
      .eq('id', link.artist_id)
      .maybeSingle()
    artistSlug = artist?.slug ?? null
  }

  return { kind: 'event', slug: event.slug, artistSlug, linkId: link.id, code: link.code }
}

/**
 * Book the click for a resolved link.
 *
 * Preview crawlers are served the page in full and never counted: every
 * platform fetches a link the moment it is pasted, and counting those fetches
 * was booking a click for every share that no person made.
 *
 * Best-effort by design. Attribution is valuable; it is not worth failing an
 * organiser's event page over. A write that fails is a lost row, not a lost
 * sale.
 *
 * FOR AN EXTERNAL LINK THIS IS AWAITED BEFORE THE REDIRECT, deliberately. The
 * founder ruling says record the click BEFORE redirecting, and it is the only
 * signal that link will ever produce: once the visitor leaves, everything that
 * happens is on somebody else's site and invisible to us. A dropped click there
 * is not a degraded metric, it is the whole measurement.
 */
export async function recordShortLinkClick(
  link: ResolvedShortLink,
  headers: { userAgent: string | null; ip: string | null },
): Promise<void> {
  try {
    if (!(await isFeatureEnabled('broadcast_share'))) return
    if (isPreviewCrawler(headers.userAgent)) return
    await recordShareLinkEvent({
      linkId: link.linkId,
      kind: 'click',
      visitorHash: visitorHash(headers.ip, headers.userAgent),
    })
  } catch {
    // Never surface an attribution failure to a person trying to buy a ticket.
  }
}
