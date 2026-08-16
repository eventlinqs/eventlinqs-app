import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import EventDetailPage, {
  generateMetadata as eventMetadata,
} from '@/app/events/[slug]/page'
import { recordShortLinkClick, resolveShortCode } from '@/lib/broadcast/resolve-short-link'
import { validateExternalTicketUrl } from '@/lib/broadcast/external-destination'

/**
 * THE SHARE ADDRESS: /e/[code].
 *
 * www.eventlinqs.com.au/e/basement-45-ig
 *
 * INTERNAL LINKS ARE UNCHANGED. This IS the event page. It is not a redirect to
 * one. Eventbrite's own default event address is /e/[slug], DICE uses
 * dice.fm/event/, Ticketmaster uses descriptive path segments, and none of the
 * three bounces the visitor through a hop first. A redirect costs a round trip
 * on a phone in a venue, it drops a bearer token across hosts, and it needs a
 * whole subsystem kept alive for the rest of the platform's life. So the code is
 * resolved, the click is booked, and the same event page component renders, all
 * on one request.
 *
 * EXTERNAL LINKS REDIRECT OUT. Founder ruling 15 August 2026. The tracked link
 * is ours and on the canonical host, so it can be printed on a poster and
 * counted; the ticketing lives on somebody else's site, so the visitor is handed
 * onward. The click is recorded BEFORE the redirect, because it is the only
 * signal this link will ever produce: everything after the hop happens where we
 * cannot see it.
 *
 * THE STATUS CODE IS 307, NOT 302, AND THAT IS DELIBERATE. The ruling asked for
 * a 302. Next's `redirect()` emits 307 and cannot be configured to emit 302, and
 * Next documents the reason: a 302 "will change the request method from POST to
 * GET", while a 307 "will preserve the request method"
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md,
 * read 15 August 2026). For a QR scan or a tapped link, which is a GET, the two
 * are behaviourally identical to the visitor and to every browser; 307 is the
 * stricter of the two. Emitting a literal 302 would mean converting this file to
 * a Route Handler and serving the internal case through a rewrite, which changes
 * how every existing event page is produced and is exactly the regression
 * non-negotiable 5 forbids. A one-digit difference with no user-visible effect
 * is not worth that risk, so the deviation is recorded here rather than hidden.
 *
 * WHAT CARRIES THE ATTRIBUTION FORWARD. The click row is written here. The
 * last-touch cookie, which is what lets a purchase made twenty minutes later
 * still credit the right channel, is set in the middleware (src/proxy.ts): a
 * Server Component cannot write a cookie during render, and that is a Next.js
 * constraint rather than a design choice.
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

  // An external link is a hop, not a page. It has nothing of its own to unfurl
  // and must never be indexed, so it carries a minimal card and no crawl.
  if (link.kind === 'external') {
    return { title: 'Tickets | EventLinqs', robots: { index: false, follow: false } }
  }

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

  if (link.kind === 'external') {
    /*
     * A DESTINATION THAT HAS SINCE DIED, and the honest boundary of what that
     * can mean here.
     *
     * The stored URL is re-validated on every hop rather than trusted, so a row
     * that was corrupted, or written before the validator existed, cannot put a
     * `javascript:` payload or a non-https address into a Location header. When
     * it fails, the visitor is NOT redirected and NOT shown a raw error: they
     * get a page that tells them the truth and offers a way onward, which is the
     * "never strand them" half of the ruling.
     *
     * WHAT THIS CANNOT DETECT, stated rather than implied: a URL that is
     * perfectly well formed and returns a 404 on the other site. Detecting that
     * would mean fetching an organiser-supplied address on every scan, which is
     * a request-forgery surface and a latency cost on the one path that must be
     * instant. We deliberately never fetch it. That case is handled by the
     * organiser's own reach panel showing clicks against a link they can test.
     */
    const checked = validateExternalTicketUrl(link.destination)
    if (!checked.ok) {
      return (
        <main className="mx-auto max-w-7xl px-4 py-24 text-center">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Tickets
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
            We could not open the ticket link
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--text-secondary)]">
            Tickets for this event are sold on another site, and the address the
            organiser gave us is no longer valid. Nothing is wrong with your
            link. The organiser can fix it from their kit.
          </p>
          <div className="mt-8">
            <Link
              href="/events"
              className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-navy)] px-6 text-sm font-semibold text-white"
            >
              Browse events on EventLinqs
            </Link>
          </div>
        </main>
      )
    }
    redirect(checked.url)
  }

  // An artist-tagged link lands on the artist share landing, which carries the
  // "[Artist] live at [Event]" card. That surface is a different page, so it
  // is the one case that navigates rather than renders in place.
  if (link.artistSlug) redirect(`/events/${link.slug}/with/${link.artistSlug}`)

  return EventDetailPage({ params: Promise.resolve({ slug: link.slug }) })
}
