'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { afterResponse } from '@/lib/after-response'
import { recordDemand, LEDGER_EVENT_COLUMNS, type EventForLedger } from '@/lib/ledger/adapter'

/**
 * Follow-graph server actions (demand engine 1: the Attendee Demand Graph).
 *
 * NO migration: these write only to tables that already exist.
 *   - "Follow an organiser" => a row in `saved_organisers`.
 *   - "Follow an artist"    => a row in `follows` (followable_type='artist').
 *   - "Follow a scene"      => a row in `follows` (followable_type='subgenre').
 *
 * Every action is guarded by an authenticated session (getUser) and returns the
 * NEW follow state so the client can settle its optimistic toggle. The shape
 * mirrors the existing waitlist/checkout actions: a discriminated result with an
 * optional `error` string, never a throw across the action boundary.
 *
 * Anonymous callers get `{ following: false, requiresAuth: true }`; the
 * <FollowButton> redirects them to /login?redirect=... exactly like
 * SaveEventButton does, so there is no silent no-op.
 */

export interface FollowResult {
  /** The follow state after the toggle (the new truth). */
  following: boolean
  /** Set when the caller was not authenticated; the client sends them to login. */
  requiresAuth?: boolean
  error?: string
}

const UuidSchema = z.string().uuid('Invalid id')
// Scene/subgenre is a slug, not a uuid (e.g. 'electronic-dance', 'afrobeats').
const SlugSchema = z
  .string()
  .min(1, 'Invalid scene')
  .max(80, 'Invalid scene')
  .regex(/^[a-z0-9-]+$/, 'Invalid scene')

/**
 * Read the current follow state without mutating it. Used by <FollowButton> on
 * mount so the host page does not need to be made dynamic - the button resolves
 * its own state client-side, the same shape as SaveEventButton's session read.
 */
export async function getFollowState(input: {
  type: 'organiser' | 'artist' | 'subgenre'
  id: string
}): Promise<FollowResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { following: false, requiresAuth: true }

  if (input.type === 'organiser') {
    const parsed = UuidSchema.safeParse(input.id)
    if (!parsed.success) return { following: false, error: 'Invalid id' }
    const { data, error } = await supabase
      .from('saved_organisers')
      .select('id')
      .eq('user_id', user.id)
      .eq('organisation_id', parsed.data)
      .maybeSingle()
    if (error) return { following: false, error: 'Could not load follow state' }
    return { following: Boolean(data) }
  }

  const idSchema = input.type === 'artist' ? UuidSchema : SlugSchema
  const parsed = idSchema.safeParse(input.id)
  if (!parsed.success) return { following: false, error: 'Invalid id' }

  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('followable_type', input.type)
    .eq('followable_id', parsed.data)
    .maybeSingle()
  if (error) return { following: false, error: 'Could not load follow state' }
  return { following: Boolean(data) }
}

/**
 * Toggle following an organiser. Writes to `saved_organisers`.
 * Insert when not yet followed, delete when already followed.
 */
export async function toggleFollowOrganiser(
  organisationId: string,
  /** WI1. The event page the follow was made from, so it counts on that event. */
  fromEventId?: string,
): Promise<FollowResult> {
  const parsed = UuidSchema.safeParse(organisationId)
  if (!parsed.success) return { following: false, error: 'Invalid organiser id' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { following: false, requiresAuth: true }

  const { data: existing, error: readError } = await supabase
    .from('saved_organisers')
    .select('id')
    .eq('user_id', user.id)
    .eq('organisation_id', parsed.data)
    .maybeSingle()
  if (readError) return { following: false, error: 'Something went wrong. Please try again.' }

  if (existing) {
    const { error } = await supabase
      .from('saved_organisers')
      .delete()
      .eq('user_id', user.id)
      .eq('organisation_id', parsed.data)
    if (error) return { following: true, error: 'Could not unfollow. Please try again.' }
    return { following: false }
  }

  const { error } = await supabase
    .from('saved_organisers')
    .insert({ user_id: user.id, organisation_id: parsed.data })
  if (error) return { following: false, error: 'Could not follow. Please try again.' }
  if (fromEventId && UuidSchema.safeParse(fromEventId).success) {
    afterResponse('the follow demand row', () => recordFollowOnEvent(fromEventId, parsed.data, user.id))
  }
  return { following: true }
}

/**
 * WI1. A follow from an event page is one of the conversions a free event has
 * (WI1-ITEM.md point 5), so it is a demand row on that event: one per person per
 * event, carrying no address. Only when the event is published, public and run
 * by the organiser just followed, so a crafted id cannot credit somebody else's
 * event.
 */
async function recordFollowOnEvent(eventId: string, organisationId: string, userId: string) {
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select(`${LEDGER_EVENT_COLUMNS}, status, visibility`)
    .eq('id', eventId)
    .maybeSingle()
  const row = event as ({ status?: string; visibility?: string; organisation_id?: string } & Record<string, unknown>) | null
  if (!row || row.status !== 'published' || row.visibility !== 'public' || row.organisation_id !== organisationId) return
  await recordDemand({
    event: event as unknown as EventForLedger,
    action: 'follow',
    occurrenceKey: `${eventId}:${userId}`,
    visitorId: userId,
  })
}

/** Shared follows-table toggle for artist / subgenre. */
async function toggleFollow(
  type: 'artist' | 'subgenre',
  followableId: string,
): Promise<FollowResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { following: false, requiresAuth: true }

  const { data: existing, error: readError } = await supabase
    .from('follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('followable_type', type)
    .eq('followable_id', followableId)
    .maybeSingle()
  if (readError) return { following: false, error: 'Something went wrong. Please try again.' }

  if (existing) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('user_id', user.id)
      .eq('followable_type', type)
      .eq('followable_id', followableId)
    if (error) return { following: true, error: 'Could not unfollow. Please try again.' }
    return { following: false }
  }

  const { error } = await supabase
    .from('follows')
    .insert({ user_id: user.id, followable_type: type, followable_id: followableId })
  if (error) return { following: false, error: 'Could not follow. Please try again.' }
  return { following: true }
}

/**
 * Toggle following an artist. Writes to `follows` with followable_type='artist'.
 */
export async function toggleFollowArtist(artistId: string): Promise<FollowResult> {
  const parsed = UuidSchema.safeParse(artistId)
  if (!parsed.success) return { following: false, error: 'Invalid artist id' }
  return toggleFollow('artist', parsed.data)
}

/**
 * Toggle following a scene / subgenre. Writes to `follows` with
 * followable_type='subgenre'. The id is the scene slug.
 */
export async function toggleFollowScene(subgenreSlug: string): Promise<FollowResult> {
  const parsed = SlugSchema.safeParse(subgenreSlug)
  if (!parsed.success) return { following: false, error: 'Invalid scene' }
  return toggleFollow('subgenre', parsed.data)
}
