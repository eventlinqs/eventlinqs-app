import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Performer marketplace: gig board reads (SPEC: Gig Board, flag gig_board).
 *
 * The gig is a structured listing; the application is deliberately THIN. The
 * proof that travels with an application (draw data, lineup history, showcase
 * links) is resolved LIVE from the artist layer at review time, never copied,
 * so it can never go stale and never be inflated. Mutations live in the
 * server actions (the lineup.ts pattern: admin client behind explicit gates).
 * No table here touches money; booking never moves funds.
 */

export const PERFORMANCE_TYPES = [
  'musician',
  'dj',
  'comedian',
  'dancer',
  'mc',
  'band',
  'other',
] as const
export type PerformanceType = (typeof PERFORMANCE_TYPES)[number]

export const PERFORMANCE_TYPE_LABELS: Record<PerformanceType, string> = {
  musician: 'Musician',
  dj: 'DJ',
  comedian: 'Comedian',
  dancer: 'Dancer',
  mc: 'MC',
  band: 'Band',
  other: 'Other',
}

export const PAY_TYPES = ['fixed_fee', 'door_split', 'ticket_share', 'negotiable'] as const
export type PayType = (typeof PAY_TYPES)[number]

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  fixed_fee: 'Fixed fee',
  door_split: 'Door split',
  ticket_share: 'Ticket share',
  negotiable: 'Negotiable',
}

export function isPerformanceType(value: string): value is PerformanceType {
  return (PERFORMANCE_TYPES as readonly string[]).includes(value)
}
export function isPayType(value: string): value is PayType {
  return (PAY_TYPES as readonly string[]).includes(value)
}

export interface GigRow {
  id: string
  organisation_id: string
  created_by: string | null
  event_id: string | null
  title: string
  description: string
  city_slug: string
  venue_name: string | null
  performance_type: PerformanceType
  pay_type: PayType
  pay_amount_cents: number | null
  pay_note: string | null
  event_date: string
  application_deadline: string
  status: 'open' | 'closed' | 'filled' | 'removed'
  created_at: string
}

export interface GigWithOrg extends GigRow {
  organisation_name: string
}

export interface GigApplicationRow {
  id: string
  gig_id: string
  artist_id: string
  applicant_user_id: string
  note: string
  status: 'submitted' | 'shortlisted' | 'declined' | 'withdrawn' | 'booked'
  created_at: string
}

type Admin = ReturnType<typeof createAdminClient>

const GIG_COLUMNS =
  'id, organisation_id, created_by, event_id, title, description, city_slug, venue_name, performance_type, pay_type, pay_amount_cents, pay_note, event_date, application_deadline, status, created_at'

export interface GigBoardFilters {
  citySlug?: string | null
  performanceType?: PerformanceType | null
  payType?: PayType | null
  from?: string | null
  limit?: number
}

/** Open gigs for the public board, soonest performance date first. */
export async function fetchOpenGigs(
  admin: Admin,
  filters: GigBoardFilters = {},
): Promise<GigWithOrg[]> {
  let query = admin
    .from('gigs')
    .select(`${GIG_COLUMNS}, organisation:organisations(name)`)
    .eq('status', 'open')
    .gte('application_deadline', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(filters.limit ?? 48)

  if (filters.citySlug) query = query.eq('city_slug', filters.citySlug)
  if (filters.performanceType) query = query.eq('performance_type', filters.performanceType)
  if (filters.payType) query = query.eq('pay_type', filters.payType)
  if (filters.from) query = query.gte('event_date', filters.from)

  const { data } = await query
  type Row = GigRow & { organisation: { name: string } | null }
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    organisation_name: row.organisation?.name ?? 'Organiser',
  }))
}

export async function fetchGigById(admin: Admin, id: string): Promise<GigWithOrg | null> {
  const { data } = await admin
    .from('gigs')
    .select(`${GIG_COLUMNS}, organisation:organisations(name)`)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  type Row = GigRow & { organisation: { name: string } | null }
  const row = data as unknown as Row
  return { ...row, organisation_name: row.organisation?.name ?? 'Organiser' }
}

/** The organiser's own gigs, newest first, every status. */
export async function fetchOrganisationGigs(admin: Admin, organisationId: string): Promise<GigRow[]> {
  const { data } = await admin
    .from('gigs')
    .select(GIG_COLUMNS)
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as GigRow[]
}

/** Applications for one gig (organiser review side), newest first. */
export async function fetchGigApplications(
  admin: Admin,
  gigId: string,
): Promise<(GigApplicationRow & { artist: { id: string; slug: string; name: string; image_url: string | null; bio: string | null } })[]> {
  const { data } = await admin
    .from('gig_applications')
    .select('id, gig_id, artist_id, applicant_user_id, note, status, created_at, artist:artists(id, slug, name, image_url, bio)')
    .eq('gig_id', gigId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as (GigApplicationRow & {
    artist: { id: string; slug: string; name: string; image_url: string | null; bio: string | null }
  })[]
}

/** A performer's own applications across gigs, newest first. */
export async function fetchArtistApplications(
  admin: Admin,
  artistId: string,
): Promise<(GigApplicationRow & { gig: GigRow | null })[]> {
  const { data } = await admin
    .from('gig_applications')
    .select(`id, gig_id, artist_id, applicant_user_id, note, status, created_at, gig:gigs(${GIG_COLUMNS})`)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as (GigApplicationRow & { gig: GigRow | null })[]
}

/** Is this organisation-performer pair blocked (either direction)? */
export async function isPairBlocked(
  admin: Admin,
  organisationId: string,
  artistId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('marketplace_blocks')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('artist_id', artistId)
    .maybeSingle()
  return Boolean(data)
}

export interface BookingRequestRow {
  id: string
  kind: 'booking' | 'mentoring'
  gig_id: string | null
  application_id: string | null
  organisation_id: string | null
  artist_id: string
  from_artist_id: string | null
  sent_by: string | null
  subject: string
  note: string
  pay_type: PayType | null
  pay_amount_cents: number | null
  pay_note: string | null
  proposed_date: string | null
  event_id: string | null
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  created_at: string
  responded_at: string | null
}

const REQUEST_COLUMNS =
  'id, kind, gig_id, application_id, organisation_id, artist_id, from_artist_id, sent_by, subject, note, pay_type, pay_amount_cents, pay_note, proposed_date, event_id, status, created_at, responded_at'

/** Requests awaiting or answered by one performer, newest first. */
export async function fetchArtistRequests(
  admin: Admin,
  artistId: string,
): Promise<(BookingRequestRow & { organisation: { name: string } | null })[]> {
  const { data } = await admin
    .from('booking_requests')
    .select(`${REQUEST_COLUMNS}, organisation:organisations(name)`)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as (BookingRequestRow & { organisation: { name: string } | null })[]
}

export async function fetchRequestById(admin: Admin, id: string): Promise<BookingRequestRow | null> {
  const { data } = await admin
    .from('booking_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  return (data as unknown as BookingRequestRow | null) ?? null
}
