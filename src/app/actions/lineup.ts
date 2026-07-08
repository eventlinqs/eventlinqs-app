'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { generateArtistSlug } from '@/lib/broadcast/artists'

/**
 * Lineup tagging (Broadcast Layer SPEC 4.2). Every mutation is gated by
 * getOrganiserEvent (fails closed: only the event's owner manages its
 * lineup) and by the broadcast_artists flag. Artists are shared global
 * entities: tagging by name reuses an existing artist with that exact name
 * before creating one, so one performer never fragments into duplicates.
 */

export type LineupActionResult = { ok: boolean; error?: string; inviteUrl?: string }

async function gate(eventId: string): Promise<{ ok: false; error: string } | { ok: true }> {
  if (!(await isFeatureEnabled('broadcast_artists'))) {
    return { ok: false, error: 'Performer tagging is not switched on yet.' }
  }
  const event = await getOrganiserEvent(eventId)
  if (!event) return { ok: false, error: 'Not your event.' }
  return { ok: true }
}

const AddSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1).max(120),
})

/** Tag a performer on the event by name (reuse-or-create), confirmed. */
export async function addArtistToLineupAction(input: {
  eventId: string
  name: string
}): Promise<LineupActionResult> {
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter the performer name.' }
  const gated = await gate(parsed.data.eventId)
  if (!gated.ok) return gated

  const admin = createAdminClient()
  const name = parsed.data.name.trim()

  const { data: existing } = await admin
    .from('artists')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  let artistId = existing?.id ?? null
  if (!artistId) {
    const { data: created, error } = await admin
      .from('artists')
      .insert({ name, slug: generateArtistSlug(name) })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: 'Could not create the artist.' }
    artistId = created.id
  }

  const { count } = await admin
    .from('event_artists')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', parsed.data.eventId)

  const { error: tagError } = await admin.from('event_artists').insert({
    event_id: parsed.data.eventId,
    artist_id: artistId,
    billing_order: count ?? 0,
    status: 'confirmed',
  })
  if (tagError && tagError.code !== '23505') {
    return { ok: false, error: 'Could not tag the performer.' }
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/lineup`)
  return { ok: true }
}

const RemoveSchema = z.object({
  eventId: z.string().uuid(),
  artistId: z.string().uuid(),
})

/** Remove a performer tag from the event. The artist entity remains. */
export async function removeArtistFromLineupAction(input: {
  eventId: string
  artistId: string
}): Promise<LineupActionResult> {
  const parsed = RemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  const gated = await gate(parsed.data.eventId)
  if (!gated.ok) return gated

  const admin = createAdminClient()
  await admin
    .from('event_artists')
    .delete()
    .eq('event_id', parsed.data.eventId)
    .eq('artist_id', parsed.data.artistId)

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/lineup`)
  return { ok: true }
}

/**
 * Invite an untagged guest performer by link (SPEC 4.2): creates the artist
 * shell and an 'invited' tag with a claim token. The tag confirms when the
 * performer claims it, and the claim also hands them the artist profile if
 * it is unowned.
 */
export async function inviteGuestPerformerAction(input: {
  eventId: string
  name: string
}): Promise<LineupActionResult> {
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter the performer name.' }
  const gated = await gate(parsed.data.eventId)
  if (!gated.ok) return gated

  const admin = createAdminClient()
  const name = parsed.data.name.trim()

  const { data: created, error } = await admin
    .from('artists')
    .insert({ name, slug: generateArtistSlug(name) })
    .select('id')
    .single()
  if (error || !created) return { ok: false, error: 'Could not create the artist.' }

  const inviteToken = crypto.randomUUID()
  const { count } = await admin
    .from('event_artists')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', parsed.data.eventId)

  const { error: tagError } = await admin.from('event_artists').insert({
    event_id: parsed.data.eventId,
    artist_id: created.id,
    billing_order: count ?? 0,
    status: 'invited',
    invite_token: inviteToken,
  })
  if (tagError) return { ok: false, error: 'Could not create the invite.' }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/lineup`)
  return { ok: true, inviteUrl: `/artists/claim/${inviteToken}` }
}

/**
 * Claim a guest-performer invite (signed in). Confirms the tag, clears the
 * token (single use), and assigns the artist profile to the claimer when it
 * is unowned. Idempotent for the same owner.
 */
export async function claimArtistInviteAction(token: string): Promise<LineupActionResult> {
  if (!(await isFeatureEnabled('broadcast_artists'))) {
    return { ok: false, error: 'Performer profiles are not switched on yet.' }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return { ok: false, error: 'This invite link is not valid.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in to claim your artist profile.' }

  const admin = createAdminClient()
  const { data: tag } = await admin
    .from('event_artists')
    .select('id, artist_id, event_id')
    .eq('invite_token', token)
    .maybeSingle()
  if (!tag) return { ok: false, error: 'This invite link is not valid or was already used.' }

  const { error: confirmError } = await admin
    .from('event_artists')
    .update({ status: 'confirmed', invite_token: null })
    .eq('id', tag.id)
  if (confirmError) return { ok: false, error: 'Could not confirm the invite.' }

  // Hand the profile to the claimer only when unowned: an owned profile is
  // never transferred by an event invite.
  await admin
    .from('artists')
    .update({ owner_user_id: user.id })
    .eq('id', tag.artist_id)
    .is('owner_user_id', null)

  revalidatePath('/artist/dashboard')
  return { ok: true }
}
