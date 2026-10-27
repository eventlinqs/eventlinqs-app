import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public-client'
import { venueSlugify } from '@/lib/venues/venue-slug'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'

/**
 * COLLABORATORS: A VENUE JOINS AN EVENT ANOTHER ORGANISATION RUNS AND SHARES ITS
 * KIT (the locked plan of 27 October 2026, item 15; decided in
 * docs/walk-in/COLLABORATORS-DECISION.md; the table and its rules in
 * supabase/migrations/20261027150101_event_collaborators.sql).
 *
 * The event's organiser asks; a person who owns the venue's organisation joins
 * or declines. Every write goes through the service role only after this file
 * has read who is asking, and the database holds the rules a caller cannot
 * argue past: the venue is the named organisation's own, it is its own people's
 * (not an unclaimed listing), and nobody collaborates on their own event.
 */

export type CollaboratorStatus = 'invited' | 'joined' | 'declined'

/** The venue an organiser may ask, from the event's venue row; null when there is none to ask. */
export type AskableVenue = { venueId: string; organisationId: string; name: string }

type VenueFacts = { id: string; organisation_id: string; name: string; listing_source?: string | null; claimed_at?: string | null }

/**
 * Whether the event's venue can be asked to collaborate: it belongs to another
 * organisation, and that organisation is the venue's own people (an organiser's
 * venue, or a listed venue its owner has claimed). A leaf, so tested alone.
 */
export function askableVenue(eventOrganisationId: string, venue: VenueFacts | null): AskableVenue | null {
  if (venue === null) return null
  if (venue.organisation_id === eventOrganisationId) return null
  if (venue.listing_source === 'eventlinqs' && !venue.claimed_at) return null
  return { venueId: venue.id, organisationId: venue.organisation_id, name: venue.name }
}

async function signedInUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function ownsOrganisation(userId: string, organisationId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('organisations').select('id').eq('id', organisationId).eq('owner_id', userId).maybeSingle()
  if (error) throw new Error(`the organisation could not be read: ${error.message}`)
  return data !== null
}

/** The event's venue and where the ask stands, for the organiser's own dashboard. */
export async function readVenueAsk(event: { id: string; organisation_id: string; venue_id: string | null }): Promise<{
  venue: AskableVenue | null
  status: CollaboratorStatus | null
}> {
  if (!event.venue_id) return { venue: null, status: null }
  const admin = createAdminClient()
  const [venue, row] = await Promise.all([
    admin.from('venues').select('id, organisation_id, name, listing_source, claimed_at').eq('id', event.venue_id).maybeSingle(),
    admin.from('event_collaborators').select('status').eq('event_id', event.id).eq('venue_id', event.venue_id).maybeSingle(),
  ])
  if (venue.error) throw new Error(`the venue could not be read: ${venue.error.message}`)
  if (row.error) throw new Error(`the collaboration could not be read: ${row.error.message}`)
  return {
    venue: askableVenue(event.organisation_id, (venue.data as VenueFacts | null) ?? null),
    status: ((row.data as { status: CollaboratorStatus } | null)?.status ?? null),
  }
}

export type AskResult = { ok: true } | { ok: false; reason: string }

/** The event's organiser asks its venue to join. Refused unless the asker owns the event's organisation. */
export async function askVenueToJoin(eventId: string): Promise<AskResult> {
  const userId = await signedInUserId()
  if (userId === null) return { ok: false, reason: 'Sign in to ask the venue.' }
  const admin = createAdminClient()
  const { data: event, error } = await admin.from('events').select('id, organisation_id, venue_id').eq('id', eventId).maybeSingle()
  if (error) return { ok: false, reason: 'The event could not be read. Try again.' }
  if (!event || !(await ownsOrganisation(userId, event.organisation_id))) return { ok: false, reason: 'Only the event\'s organiser can ask its venue.' }
  const { venue } = await readVenueAsk(event)
  if (venue === null) return { ok: false, reason: 'This event\'s venue cannot be asked yet.' }
  const { error: insertError } = await admin
    .from('event_collaborators')
    .upsert({ event_id: event.id, organisation_id: venue.organisationId, venue_id: venue.venueId, asked_by: userId }, { onConflict: 'event_id,organisation_id', ignoreDuplicates: true })
  if (insertError) return { ok: false, reason: 'The venue could not be asked. Try again.' }
  return { ok: true }
}

/** A person who owns the venue's organisation joins, or declines. */
export async function answerCollaboration(collaboratorId: string, join: boolean): Promise<AskResult> {
  const userId = await signedInUserId()
  if (userId === null) return { ok: false, reason: 'Sign in to answer.' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('event_collaborators').select('id, organisation_id, status').eq('id', collaboratorId).maybeSingle()
  if (error) return { ok: false, reason: 'The request could not be read. Try again.' }
  if (!row || !(await ownsOrganisation(userId, row.organisation_id))) return { ok: false, reason: 'Only the venue\'s own people can answer.' }
  if (row.status !== 'invited') return { ok: false, reason: 'This request has already been answered.' }
  const { error: updateError } = await admin
    .from('event_collaborators')
    .update({ status: join ? 'joined' : 'declined', answered_by: userId, answered_at: new Date().toISOString() })
    .eq('id', collaboratorId)
    .eq('status', 'invited')
  if (updateError) return { ok: false, reason: 'The answer could not be saved. Try again.' }
  return { ok: true }
}

export type JoinedCollaborator = { id: string; name: string; venuePath: string }

/** The venues that joined an event, for its public page. Read as the public reads it: only joined rows. */
export async function readJoinedCollaborators(eventId: string): Promise<JoinedCollaborator[]> {
  const { data, error } = await createPublicClient()
    .from('event_collaborators')
    .select('id, venue:venues(name)')
    .eq('event_id', eventId)
    .eq('status', 'joined')
    .limit(10)
  if (error) {
    console.error('[collaborators] the joined venues could not be read', { eventId, error: error.message })
    return []
  }
  return ((data ?? []) as { id: string; venue: { name: string } | { name: string }[] | null }[])
    .map((r) => ({ id: r.id, name: (Array.isArray(r.venue) ? r.venue[0]?.name : r.venue?.name) ?? '' }))
    .filter((r) => r.name.trim() !== '')
    .map((r) => ({ id: r.id, name: r.name, venuePath: `/venues/${venueSlugify(r.name)}` }))
}

export type MyCollaboration = {
  id: string
  status: CollaboratorStatus
  eventId: string
  eventTitle: string
  eventSlug: string
  startDate: string
  timezone: string | null
  venueName: string
}

/** Every event the signed-in person's venues were asked to join, newest first. */
export async function readMyCollaborations(): Promise<{ userId: string; rows: MyCollaboration[] } | null> {
  const userId = await signedInUserId()
  if (userId === null) return null
  const admin = createAdminClient()
  const { data: orgs, error: orgError } = await admin.from('organisations').select('id').eq('owner_id', userId).limit(50)
  if (orgError) throw new Error(`the organisations could not be read: ${orgError.message}`)
  const ids = (orgs ?? []).map((o) => o.id)
  if (ids.length === 0) return { userId, rows: [] }
  const { data, error } = await admin
    .from('event_collaborators')
    .select('id, status, event:events(id, title, slug, start_date, timezone), venue:venues(name)')
    .in('organisation_id', ids)
    .order('asked_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`the collaborations could not be read: ${error.message}`)
  type Row = {
    id: string
    status: CollaboratorStatus
    event: { id: string; title: string; slug: string; start_date: string; timezone: string | null } | null
    venue: { name: string } | null
  }
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const rows = ((data ?? []) as unknown as { id: string; status: CollaboratorStatus; event: Row['event'] | Row['event'][]; venue: Row['venue'] | Row['venue'][] }[])
    .map((r) => ({ id: r.id, status: r.status, event: one(r.event), venue: one(r.venue) }))
    .filter((r): r is Row & { event: NonNullable<Row['event']> } => r.event !== null)
    .map((r) => ({
      id: r.id,
      status: r.status,
      eventId: r.event.id,
      eventTitle: r.event.title,
      eventSlug: r.event.slug,
      startDate: r.event.start_date,
      timezone: r.event.timezone,
      venueName: r.venue?.name ?? '',
    }))
  return { userId, rows }
}

/** The channels a joined venue's kit carries: the ones a venue posts to. */
export const COLLABORATOR_CHANNELS = ['instagram', 'facebook', 'whatsapp', 'email', 'copy'] as const

/**
 * A joined venue's kit: one tracked link per channel, minted under its own
 * collaboration (share_links.collaborator_id), so what it brings is counted as
 * the venue's, never as the organiser's; then the views and clicks through those
 * links, counted, never estimated. Refused for anybody but the venue's own people.
 */
export async function readCollaboratorKit(
  collaboratorId: string,
  origin: string,
): Promise<{ links: { channel: (typeof COLLABORATOR_CHANNELS)[number]; url: string }[]; views: number; clicks: number } | null> {
  const userId = await signedInUserId()
  if (userId === null) return null
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('event_collaborators')
    .select('id, organisation_id, status, event:events(id, slug, start_date, timezone)')
    .eq('id', collaboratorId)
    .maybeSingle()
  if (error) throw new Error(`the collaboration could not be read: ${error.message}`)
  if (!row || row.status !== 'joined' || !(await ownsOrganisation(userId, row.organisation_id))) return null
  const event = (Array.isArray(row.event) ? row.event[0] : row.event) as { id: string; slug: string; start_date: string; timezone: string | null } | null
  if (!event) return null
  const links: { channel: (typeof COLLABORATOR_CHANNELS)[number]; url: string }[] = []
  const ids: string[] = []
  for (const channel of COLLABORATOR_CHANNELS) {
    const link = await getOrCreateShareLink({
      eventId: event.id,
      channel,
      collaboratorId,
      createdBy: userId,
      eventSlug: event.slug,
      eventStartDate: event.start_date,
      eventTimezone: event.timezone,
    })
    if (link) {
      links.push({ channel, url: buildShortUrl(origin, link.code) })
      ids.push(link.id)
    }
  }
  const counted = async (kind: 'view' | 'click') => {
    if (ids.length === 0) return 0
    const { count, error: countError } = await admin.from('share_link_events').select('id', { count: 'exact', head: true }).in('link_id', ids).eq('kind', kind)
    if (countError) throw new Error(`the ${kind} count could not be read: ${countError.message}`)
    return count ?? 0
  }
  const [views, clicks] = await Promise.all([counted('view'), counted('click')])
  return { links, views, clicks }
}
