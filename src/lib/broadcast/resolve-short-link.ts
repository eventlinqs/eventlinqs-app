import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { isValidShareCode } from '@/lib/broadcast/share-codes'
import { isValidReadableCode } from '@/lib/broadcast/short-links'
import { recordShareLinkEvent, resolveShareLink, visitorHash } from '@/lib/broadcast/share-links'

/**
 * Resolve a share code to the event it belongs to, and record the click, on
 * the SAME request that renders the page.
 *
 * There is no redirect. Eventbrite does not redirect, DICE does not redirect,
 * Ticketmaster does not redirect: the readable address IS the page. A redirect
 * costs a hop, drops a bearer token across hosts, and needs a whole subsystem
 * to keep alive. /e/[code] renders the event page itself and books the click
 * on the way through.
 *
 * BOTH code formats resolve here. A readable code (basement-45-ig) and a
 * legacy random code (Rk9dW2xa1B) are both valid input, because a poster
 * already in a venue window carries the legacy form and must never break.
 */

export type ResolvedShortLink = {
  /** The event page to render. */
  slug: string
  /** The artist landing, when the link was minted for a tagged act. */
  artistSlug: string | null
  /** The share_links row id, for attribution. */
  linkId: string
  code: string
}

/** Look up a code without recording anything. Format-gated before any query. */
export async function resolveShortCode(code: string): Promise<ResolvedShortLink | null> {
  if (!isValidShareCode(code) && !isValidReadableCode(code)) return null

  const link = await resolveShareLink(code)
  if (!link) return null

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('slug')
    .eq('id', link.event_id)
    .maybeSingle()
  if (!event?.slug) return null

  let artistSlug: string | null = null
  if (link.artist_id) {
    const { data: artist } = await admin
      .from('artists')
      .select('slug')
      .eq('id', link.artist_id)
      .maybeSingle()
    artistSlug = artist?.slug ?? null
  }

  return { slug: event.slug, artistSlug, linkId: link.id, code: link.code }
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
