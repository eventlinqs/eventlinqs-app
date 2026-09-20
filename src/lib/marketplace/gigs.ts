import type { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { readEveryRow, type PagedResult } from '@/lib/supabase/read-every-row'

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

  // A FAILED READ IS NOT AN EMPTY GIG BOARD. The error was discarded, so a
  // dropped socket rendered the public board as a platform with no work on it,
  // to every performer who came looking. The bound above is deliberate and
  // stays (this is a browse surface with a page size, not a set that must be
  // read whole); what changes is that a failure is now a failure.
  const { data, error } = await query
  if (error) throw new Error(`the open gig board could not be read: ${error.message}`)
  type Row = GigRow & { organisation: { name: string } | null }
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    organisation_name: row.organisation?.name ?? 'Organiser',
  }))
}

export async function fetchGigById(admin: Admin, id: string): Promise<GigWithOrg | null> {
  type Row = GigRow & { organisation: { name: string } | null }
  // Both callers turn null into notFound(), so a failed read must not become
  // null: readOrThrow retries a blink and throws a real fault.
  const row = await readOrThrow(
    'gig',
    () =>
      admin
        .from('gigs')
        .select(`${GIG_COLUMNS}, organisation:organisations(name)`)
        .eq('id', id)
        .maybeSingle() as unknown as Read<Row>,
  )
  if (!row) return null
  return { ...row, organisation_name: row.organisation?.name ?? 'Organiser' }
}

/**
 * The organiser's own gigs, newest first, every status.
 *
 * PAGED AND THROWING, where it was unbounded and silent. Supabase stops a
 * response at 1,000 rows and says nothing about it, and the error was not bound
 * either, so a failed read rendered as an organiser who has posted no gigs, on
 * the screen whose whole job is to list them.
 *
 * ORDERED ON created_at AND THEN id, because created_at is not unique and
 * paging over a partial order can return one row in two windows and no window
 * at all for another.
 */
export async function fetchOrganisationGigs(admin: Admin, organisationId: string): Promise<GigRow[]> {
  const rows = await readEveryRow<GigRow>('this organiser\'s gigs', (from, to) =>
    admin
      .from('gigs')
      .select(GIG_COLUMNS)
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<PagedResult<GigRow>>,
  )
  return rows
}

/**
 * Applications for one gig (organiser review side), newest first.
 *
 * THE MOST EXPENSIVE SILENCE IN THIS MODULE. Unbounded and with its error
 * discarded, a failed read drew "no applications yet" on a gig that has them.
 * The organiser closes the tab and books nobody, and every performer who
 * applied waits for an answer that was never going to come, on the surface the
 * growth plan exists to make work. There is nothing on the screen or in the log
 * to say it happened.
 */
export async function fetchGigApplications(
  admin: Admin,
  gigId: string,
): Promise<(GigApplicationRow & { artist: { id: string; slug: string; name: string; image_url: string | null; bio: string | null } })[]> {
  type Row = GigApplicationRow & {
    artist: { id: string; slug: string; name: string; image_url: string | null; bio: string | null }
  }
  return readEveryRow<Row>('the applications for this gig', (from, to) =>
    admin
      .from('gig_applications')
      .select('id, gig_id, artist_id, applicant_user_id, note, status, created_at, artist:artists(id, slug, name, image_url, bio)')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<PagedResult<Row>>,
  )
}

/**
 * A performer's own applications across gigs, newest first.
 *
 * The other side of the same silence: a failed read told a performer they had
 * applied for nothing, which is the list they check to find out whether to
 * follow up.
 */
export async function fetchArtistApplications(
  admin: Admin,
  artistId: string,
): Promise<(GigApplicationRow & { gig: GigRow | null })[]> {
  type Row = GigApplicationRow & { gig: GigRow | null }
  return readEveryRow<Row>('this performer\'s applications', (from, to) =>
    admin
      .from('gig_applications')
      .select(`id, gig_id, artist_id, applicant_user_id, note, status, created_at, gig:gigs(${GIG_COLUMNS})`)
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<PagedResult<Row>>,
  )
}

/**
 * Is this organisation-performer pair blocked (either direction)?
 *
 * A FAILED READ IS NOT AN ABSENT BLOCK, and this one was. It read
 * `const { data } = await ...` and returned `Boolean(data)`, so a dropped
 * socket, a pool refusal or a statement timeout left `data` null and the
 * answer was FALSE, which is the answer that means NOT BLOCKED. Both call
 * sites read it as permission, so for the length of any fault in this one read
 * a block stopped holding: the organiser who blocked a performer received their
 * application, and the performer who was blocked was put back in front of the
 * organiser who blocked them. A block is a safety decision a person made about
 * somebody they do not want contact from, and it is the one answer in this
 * module that must never be guessed.
 *
 * It THROWS now. A caller that cannot establish whether a pair is blocked must
 * refuse the contact, not allow it, and a thrown error is the only answer that
 * cannot be mistaken for "no block here". Migration 20260920000060 is the
 * backstop underneath: both triggers refuse the insert whatever this returns.
 */
export async function isPairBlocked(
  admin: Admin,
  organisationId: string,
  artistId: string,
): Promise<boolean> {
  const row = await readOrThrow('marketplace-block-check', () =>
    admin
      .from('marketplace_blocks')
      .select('id')
      .eq('organisation_id', organisationId)
      .eq('artist_id', artistId)
      .maybeSingle(),
  )
  return Boolean(row)
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

/**
 * Requests awaiting or answered by one performer, newest first.
 *
 * A failed read here told a performer nobody had offered them work, which is
 * the whole point of the surface and is offered to them as a fact.
 */
export async function fetchArtistRequests(
  admin: Admin,
  artistId: string,
): Promise<(BookingRequestRow & { organisation: { name: string } | null })[]> {
  type Row = BookingRequestRow & { organisation: { name: string } | null }
  return readEveryRow<Row>('this performer\'s booking requests', (from, to) =>
    admin
      .from('booking_requests')
      .select(`${REQUEST_COLUMNS}, organisation:organisations(name)`)
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<PagedResult<Row>>,
  )
}

/**
 * One request by id. Null means the database said there is no such row.
 *
 * It used to mean that OR that the read failed, and the callers answer a
 * refusal on null, so a blink told a performer the offer they were looking at
 * does not exist.
 */
export async function fetchRequestById(admin: Admin, id: string): Promise<BookingRequestRow | null> {
  const row = await readOrThrow(
    'marketplace-booking-request',
    () =>
      admin
        .from('booking_requests')
        .select(REQUEST_COLUMNS)
        .eq('id', id)
        .maybeSingle() as unknown as Read<BookingRequestRow>,
  )
  return (row as BookingRequestRow | null) ?? null
}
