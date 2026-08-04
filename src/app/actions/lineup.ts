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
  /** Set when the organiser picked an existing performer from search, so we
   *  attach that exact artist instead of re-matching loosely by name. */
  artistId: z.string().uuid().optional(),
})

const SearchSchema = z.object({ query: z.string().min(1).max(80) })

export type ArtistSearchHit = { id: string; name: string; slug: string; claimed: boolean }

/**
 * Search the shared performer directory so tagging is one step: the organiser
 * types a name, picks an existing act if we already know them (no duplicate
 * profiles), or adds a brand new one. Gated by the artists flag and a signed-in
 * user; returns public profile fields only.
 */
export async function searchArtistsAction(
  query: string,
): Promise<{ ok: boolean; artists: ArtistSearchHit[]; error?: string }> {
  const parsed = SearchSchema.safeParse({ query })
  if (!parsed.success) return { ok: true, artists: [] }
  if (!(await isFeatureEnabled('broadcast_artists'))) {
    return { ok: false, artists: [], error: 'Performer tagging is not switched on yet.' }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, artists: [], error: 'Sign in to search performers.' }

  const admin = createAdminClient()
  // Escape LIKE wildcards so a name containing % or _ cannot widen the search.
  const term = parsed.data.query.trim().replace(/[\\%_]/g, (m) => `\\${m}`)
  const { data } = await admin
    .from('artists')
    .select('id, name, slug, owner_user_id')
    .ilike('name', `%${term}%`)
    .order('name', { ascending: true })
    .limit(8)

  const rows = (data ?? []) as { id: string; name: string; slug: string; owner_user_id: string | null }[]
  return {
    ok: true,
    artists: rows.map((a) => ({ id: a.id, name: a.name, slug: a.slug, claimed: Boolean(a.owner_user_id) })),
  }
}

/**
 * Tag a performer on the event (reuse-or-create), confirmed.
 *
 * Every tagged act that is not already claimed gets a claim token minted on
 * the tag row, so the organiser always has a claim link to send them. Claiming
 * hands the act their profile and their proof of draw; the token is cleared on
 * use (claimArtistInviteAction). An already-claimed act needs no token.
 */
export async function addArtistToLineupAction(input: {
  eventId: string
  name: string
  artistId?: string
}): Promise<LineupActionResult> {
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter the performer name.' }
  const gated = await gate(parsed.data.eventId)
  if (!gated.ok) return gated

  const admin = createAdminClient()
  const name = parsed.data.name.trim()

  let artistId: string | null = null
  if (parsed.data.artistId) {
    const { data: picked } = await admin
      .from('artists')
      .select('id')
      .eq('id', parsed.data.artistId)
      .maybeSingle()
    artistId = picked?.id ?? null
  }
  if (!artistId) {
    const { data: existing } = await admin
      .from('artists')
      .select('id')
      .ilike('name', name)
      .limit(1)
      .maybeSingle()
    artistId = existing?.id ?? null
  }
  if (!artistId) {
    const { data: created, error } = await admin
      .from('artists')
      .insert({ name, slug: generateArtistSlug(name) })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: 'Could not create the artist.' }
    artistId = created.id
  }

  const { data: owner } = await admin
    .from('artists')
    .select('owner_user_id')
    .eq('id', artistId)
    .maybeSingle()
  const claimToken = owner?.owner_user_id ? null : crypto.randomUUID()

  const { count } = await admin
    .from('event_artists')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', parsed.data.eventId)

  const { error: tagError } = await admin.from('event_artists').insert({
    event_id: parsed.data.eventId,
    artist_id: artistId,
    billing_order: count ?? 0,
    status: 'confirmed',
    invite_token: claimToken,
  })
  if (tagError && tagError.code !== '23505') {
    return { ok: false, error: 'Could not tag the performer.' }
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/lineup`)
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/launch-kit`)
  revalidatePath(`/dashboard/events/${parsed.data.eventId}`)
  return { ok: true, inviteUrl: claimToken ? `/artists/claim/${claimToken}` : undefined }
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
