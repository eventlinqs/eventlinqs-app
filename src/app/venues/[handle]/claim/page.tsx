import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { resolveVenueProfile } from '@/lib/venues/resolver'
import { ClaimForm } from '@/components/listings/claim-form'

/**
 * CLAIM THIS VENUE (WI2-PLAN.md section 9, Part 3b; the locked foundation's item 7). A venue EventLinqs listed from
 * public information is claimed free by a 6-digit code to the address it publishes (src/lib/listings/claim.ts). The
 * published address is never shown here: it stays service role only (20261023000010), so the page names where the code
 * goes without saying it. Never indexed: a form, not a page about anything.
 */

export const metadata: Metadata = {
  title: 'Claim this venue | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ handle: string }> }

export default async function ClaimVenuePage({ params }: Props) {
  const { handle } = await params
  const profile = await resolveVenueProfile(handle)
  if (!profile?.id) notFound()
  const venueId = profile.id
  const venue = await readOrThrow('claim page venue', () =>
    createAdminClient()
      .from('venues')
      .select('name, published_email, website_url, listing_source, claimed_at, removed_at')
      .eq('id', venueId)
      .limit(1)
      .maybeSingle(),
  )
  if (!venue || venue.removed_at) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const claimable = venue.listing_source === 'eventlinqs' && !venue.claimed_at
  const here = `/venues/${handle}/claim`

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">Claim this venue, free</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-900">{venue.name}</h1>
          {!claimable ? (
            <p className="mt-3 text-sm text-ink-600">This venue is already run by its owner on EventLinqs.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-600">
                Listed by EventLinqs from public information. Claim it to run its listing, its regular nights and its numbers. We send a
                code to the address {venue.name} publishes, so only the venue can claim it.
              </p>
              <div className="mt-6">
                {user ? (
                  <ClaimForm
                    kind="venue"
                    slug={handle}
                    hostName={venue.name}
                    askDomainEmail={!venue.published_email && Boolean(venue.website_url)}
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
            <Link href={`/venues/${handle}`} className="text-sm font-semibold text-ink-900 underline">
              Back to {venue.name}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
