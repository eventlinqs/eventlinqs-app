'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { resolveVenueProfile } from '@/lib/venues/resolver'
import { checkClaim, claimDeps, startClaim, type ClaimTarget } from '@/lib/listings/claim'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { claimYes } from '@/lib/listings/claim-acceptance'
import { formatEventDateTimeCompact } from '@/lib/dates/event-time'

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

/** After the right code: the claimant's nights to come (for the upload step) and their regular nights (series). */
export type ClaimedNights = { nights: { id: string; label: string }[]; series: { id: string; name: string; keep: boolean }[] }
export type ClaimCheckState = ({ state: 'verified' } & ClaimedNights) | { state: 'refused'; reason: string } | null

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

/** What a verified claim now holds: its series (a venue's, or the one event's) and their nights to come. */
async function claimedNights(claimId: string): Promise<ClaimedNights> {
  const admin = createAdminClient()
  const claim = await readOrThrow('verified claim', () => admin.from('listing_claims').select('venue_id, event_id').eq('id', claimId).limit(1).maybeSingle())
  if (!claim) return { nights: [], series: [] }
  const seriesIds: string[] = []
  let series: ClaimedNights['series'] = []
  if (claim.venue_id) {
    const venueId = claim.venue_id
    const rows = await readOrThrow('claimed series', () =>
      admin.from('event_series').select('id, name, status').eq('venue_id', venueId).neq('status', 'removed').order('name'),
    )
    series = (rows ?? []).map((r) => ({ id: r.id, name: r.name, keep: r.status === 'active' }))
    seriesIds.push(...series.map((s) => s.id))
  }
  const now = new Date().toISOString()
  const nights = claim.event_id
    ? await readOrThrow('claimed event', () => admin.from('events').select('id, title, start_date, timezone').eq('id', claim.event_id as string).gte('start_date', now))
    : seriesIds.length
      ? await readOrThrow('claimed nights', () =>
          admin.from('events').select('id, title, start_date, timezone').in('listing_series_id', seriesIds).gte('start_date', now).order('start_date').limit(50),
        )
      : []
  return { nights: (nights ?? []).map((n) => ({ id: n.id, label: `${n.title}, ${formatEventDateTimeCompact(n.start_date, n.timezone)}` })), series }
}

export async function checkListingClaim(_prev: ClaimCheckState, formData: FormData): Promise<ClaimCheckState> {
  if (!(await isFeatureEnabled('listing_claims'))) return { state: 'refused', reason: CLOSED }
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to claim this listing.' }
  // The two ticks beside the code (the claim page's words): kept on the claim, written by the database with the move.
  const at = new Date()
  const yes = claimYes({ ticked: formData.get('permission') === 'yes', authority: formData.get('authority') === 'yes' }, at)
  if (yes.state === 'refused') return yes
  const claimId = String(formData.get('claimId') ?? '')
  const answer = await checkClaim(
    { claimId, code: String(formData.get('code') ?? ''), userId, at, yes: yes.state === 'given' ? { words: yes.words, scope: yes.scope, at: yes.at } : null },
    claimDeps(),
  )
  switch (answer) {
    case 'verified':
      return { state: 'verified', ...(await claimedNights(claimId)) }
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
