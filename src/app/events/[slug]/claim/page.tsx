import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { ClaimForm } from '@/components/listings/claim-form'
import { maskAddress } from '@/lib/listings/claim'
import { listingClaimable } from '@/lib/listings/claimable'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

/**
 * CLAIM THIS EVENT (the locked foundation's item 7: "Claim this event and claim this venue, free, by a code to the
 * published email"; WI2-PLAN.md Part 3b). A curated listing, one EventLinqs listed from public information, is claimed
 * through its venue's own published address (src/lib/listings/claim.ts), shown here only masked (maskAddress). An event its
 * organiser made is theirs already and is not claimable. Never indexed.
 */

export const metadata: Metadata = {
  title: 'Claim this event | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export default async function ClaimEventPage({ params }: Props) {
  if (!(await isFeatureEnabled('listing_claims'))) notFound()
  const { slug } = await params
  const admin = createAdminClient()
  const event = await readOrThrow('claim page event', () =>
    applyPublicEventVisibility(admin.from('events').select('id, title, listing_source, venue_id').eq('slug', slug), { includeExternal: true })
      .limit(1)
      .maybeSingle(),
  )
  if (!event) notFound()
  const venueId = event.venue_id
  const venue = venueId
    ? await readOrThrow('claim page event venue', () =>
        admin.from('venues').select('name, published_email, website_url').eq('id', venueId).limit(1).maybeSingle(),
      )
    : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // The one rule the event page's claim line asks too (src/lib/listings/claimable.ts).
  const claimable = listingClaimable({ listingSource: event.listing_source, hasVenue: Boolean(venue) })
  const here = `/events/${slug}/claim`

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">Claim this event, free</p>
          {/* The project manager's claim page words (EVENTLINQS-ORGANISER-MESSAGES-28OCT.md, section 6). */}
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">{claimable ? `${event.title} is on EventLinqs. Claim it free.` : event.title}</h1>
          {!claimable || !venue ? (
            <p className="mt-3 text-sm text-ink-600">This event is already run by its organiser on EventLinqs.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-600">Takes two minutes. You keep your own tickets and booking page.</p>
              <div className="mt-6">
                {user ? (
                  <ClaimForm
                    kind="event"
                    slug={slug}
                    hostName={venue.name}
                    askDomainEmail={!venue.published_email && Boolean(venue.website_url)}
                    codeTo={maskAddress(venue.published_email)}
                    doneHref="/dashboard"
                  />
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(here)}`}
                    className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                  >
                    Sign in to claim
                  </Link>
                )}
              </div>
            </>
          )}
          <div className="mt-6">
            <Link href={`/events/${slug}`} className="text-sm font-semibold text-ink-900 underline">
              Back to {event.title}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
