'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { resolveVenueProfile } from '@/lib/venues/resolver'
import { checkClaim, claimDeps, startClaim, type ClaimTarget } from '@/lib/listings/claim'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

const CLOSED = 'Claiming a listing is not open yet.'

/**
 * CLAIM THIS VENUE, CLAIM THIS EVENT: the two presses (src/lib/listings/claim.ts holds the rules and why). Signed in
 * always: the claimant is the account the listing moves to. Starting is limited per user ('listing-claim', fail closed,
 * because it mails a venue's own address); the tries at one code are held by the database.
 */

export type ClaimStartState =
  | { state: 'sent'; claimId: string; to: string }
  | { state: 'manual' }
  | { state: 'refused'; reason: string }
  | null

export type ClaimCheckState = { state: 'verified' } | { state: 'refused'; reason: string } | null

async function signedIn(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** The target a form names, read from the database by its public slug, never trusted from the form as an id. */
async function targetOf(kind: string, slug: string): Promise<ClaimTarget | null> {
  const admin = createAdminClient()
  if (kind === 'venue') {
    // The venue page's own resolution of its handle (/venues/[handle]), so the claim names the venue the page shows.
    const profile = await resolveVenueProfile(slug)
    if (!profile?.id) return null
    const venueId = profile.id
    const venue = await readOrThrow('claim venue state', () =>
      admin.from('venues').select('id, claimed_at, listing_source, removed_at').eq('id', venueId).limit(1).maybeSingle(),
    )
    return venue && !venue.claimed_at && !venue.removed_at && venue.listing_source === 'eventlinqs' ? { kind: 'venue', venueId: venue.id } : null
  }
  if (kind === 'event') {
    const event = await readOrThrow('claim event by slug', () => admin.from('events').select('id, listing_source').eq('slug', slug).limit(1).maybeSingle())
    return event && event.listing_source === 'eventlinqs' ? { kind: 'event', eventId: event.id } : null
  }
  return null
}

export async function startListingClaim(_prev: ClaimStartState, formData: FormData): Promise<ClaimStartState> {
  if (!(await isFeatureEnabled('listing_claims'))) return { state: 'refused', reason: CLOSED }
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to claim this listing.' }
  const limited = await actionRateLimit('listing-claim', `user:${userId}`)
  if (!limited.ok) return { state: 'refused', reason: 'You have asked for several codes in the last hour. Try again later.' }
  const target = await targetOf(String(formData.get('kind') ?? ''), String(formData.get('slug') ?? ''))
  if (!target) return { state: 'refused', reason: 'This listing is already managed by its owner, or cannot be claimed.' }
  const started = await startClaim(
    {
      target,
      userId,
      name: String(formData.get('name') ?? ''),
      role: String(formData.get('role') ?? ''),
      namedEmail: String(formData.get('email') ?? '') || null,
      at: new Date(),
    },
    claimDeps(),
  )
  if (started.state === 'sent') return { state: 'sent', claimId: started.claimId, to: started.to }
  if (started.state === 'manual') return { state: 'manual' }
  return started
}

export async function checkListingClaim(_prev: ClaimCheckState, formData: FormData): Promise<ClaimCheckState> {
  if (!(await isFeatureEnabled('listing_claims'))) return { state: 'refused', reason: CLOSED }
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to claim this listing.' }
  const answer = await checkClaim(
    { claimId: String(formData.get('claimId') ?? ''), code: String(formData.get('code') ?? ''), userId, at: new Date() },
    claimDeps(),
  )
  switch (answer) {
    case 'verified':
      return { state: 'verified' }
    case 'wrong':
      return { state: 'refused', reason: 'That code does not match. Check the email and try again.' }
    case 'expired':
      return { state: 'refused', reason: 'That code has expired. Ask for a new one.' }
    case 'locked':
      return { state: 'refused', reason: 'Too many wrong codes. Ask for a new one.' }
    default:
      return { state: 'refused', reason: 'Sign in with the account that asked for this code.' }
  }
}
