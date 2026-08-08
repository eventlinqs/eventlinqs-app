import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import EventDetailPage, {
  generateMetadata as eventMetadata,
} from '@/app/events/[slug]/page'
import { recordShortLinkClick, resolveShortCode } from '@/lib/broadcast/resolve-short-link'

/**
 * THE SHARE ADDRESS: /e/[code].
 *
 * www.eventlinqs.com.au/e/basement-45-ig
 *
 * This IS the event page. It is not a redirect to one. Eventbrite's own
 * default event address is /e/[slug], DICE uses dice.fm/event/, Ticketmaster
 * uses descriptive path segments, and none of the three bounces the visitor
 * through a hop first. A redirect costs a round trip on a phone in a venue, it
 * drops a bearer token across hosts, and it needs a whole subsystem kept alive
 * for the rest of the platform's life.
 *
 * So the code is resolved, the click is booked, and the same event page
 * component renders, all on one request.
 *
 * WHAT CARRIES THE ATTRIBUTION FORWARD. The click row is written here. The
 * last-touch cookie, which is what lets a purchase made twenty minutes later
 * still credit the right channel, is set in the middleware (src/proxy.ts): a
 * Server Component cannot write a cookie during render, and that is a Next.js
 * constraint rather than a design choice. The middleware needs no database to
 * do it, because the cookie value IS the code that is already in the path.
 *
 * BOTH FORMATS RESOLVE. A readable code and a legacy random code are both
 * accepted, because a poster already hanging in a venue window carries the old
 * form and must keep working for as long as the paper lasts.
 */

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const link = await resolveShortCode(code)
  if (!link) return { title: 'Event not found | EventLinqs', robots: { index: false } }

  // The share card and the title come from the event itself, so a link pasted
  // into a chat unfurls exactly as the event page would. Not indexed: the
  // canonical address of an event is /events/[slug], and a second indexable
  // copy per channel would split it.
  const meta = await eventMetadata({ params: Promise.resolve({ slug: link.slug }) })
  return { ...meta, robots: { index: false, follow: true } }
}

export default async function ShareLinkPage({ params }: Props) {
  const { code } = await params
  const link = await resolveShortCode(code)
  if (!link) notFound()

  const requestHeaders = await headers()
  await recordShortLinkClick(link, {
    userAgent: requestHeaders.get('user-agent'),
    ip:
      requestHeaders.get('x-real-ip') ??
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null,
  })

  // An artist-tagged link lands on the artist share landing, which carries the
  // "[Artist] live at [Event]" card. That surface is a different page, so it
  // is the one case that navigates rather than renders in place.
  if (link.artistSlug) redirect(`/events/${link.slug}/with/${link.artistSlug}`)

  return EventDetailPage({ params: Promise.resolve({ slug: link.slug }) })
}
