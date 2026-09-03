import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readStreamLink } from './link'
import { normaliseCountryCodes } from './countries'

/**
 * WHO MAY WATCH (Scope v5, 3.11): the gate in front of the stream link, the
 * chat and the questions.
 *
 * It is the bearer ticket's own rule, applied again: the (ticket_code, secret)
 * pair IS the credential (src/app/t/[code]/page.tsx). On top of that, the
 * ticket must still admit (valid or scanned), it must be a LIVESTREAM ticket
 * (a virtual event, or a tier whose access_mode is virtual on a hybrid one),
 * the viewer's country must be inside the organiser's allow-list when one is
 * set, and only then is the link read from the vault.
 *
 * The decision is a pure function of facts so every branch is unit tested;
 * the resolver below gathers the facts with the service role and never hands
 * the link to a caller that was refused.
 *
 * ORDER OF REFUSALS, and why: identity, then status, then entitlement, then
 * geography, then whether a link exists. A viewer refused by geography must
 * not learn whether the organiser has added a link yet, so geography is judged
 * before the vault is read.
 */
export type StreamAccessRefusal =
  | 'not_found'
  | 'wrong_secret'
  | 'not_valid'
  | 'not_livestream_ticket'
  | 'geo_unknown'
  | 'geo_blocked'
  | 'no_stream_link'

export type StreamAccessFacts = {
  ticketFound: boolean
  secretMatches: boolean
  ticketStatus: string | null
  eventType: 'in_person' | 'virtual' | 'hybrid' | null
  tierAccessMode: 'in_person' | 'virtual' | null
  geoAllow: readonly string[] | null
  viewerCountry: string | null
  hasLink: boolean
}

export type StreamAccessDecision =
  | { ok: true }
  | { ok: false; reason: StreamAccessRefusal }

/** Statuses that still admit; mirrors QR_STATUSES in the confirmation email and page. */
export const WATCH_STATUSES: ReadonlySet<string> = new Set(['valid', 'scanned'])

export function decideStreamAccess(f: StreamAccessFacts): StreamAccessDecision {
  if (!f.ticketFound) return { ok: false, reason: 'not_found' }
  if (!f.secretMatches) return { ok: false, reason: 'wrong_secret' }
  if (!f.ticketStatus || !WATCH_STATUSES.has(f.ticketStatus)) return { ok: false, reason: 'not_valid' }
  const livestream = f.eventType === 'virtual' || f.tierAccessMode === 'virtual'
  if (!livestream) return { ok: false, reason: 'not_livestream_ticket' }
  const allow = normaliseCountryCodes(f.geoAllow)
  if (allow.length > 0) {
    const country = (f.viewerCountry ?? '').trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) return { ok: false, reason: 'geo_unknown' }
    if (!allow.includes(country)) return { ok: false, reason: 'geo_blocked' }
  }
  if (!f.hasLink) return { ok: false, reason: 'no_stream_link' }
  return { ok: true }
}

/** The two-letter code Vercel supplies, or null when the request carries none. */
export function viewerCountryFromHeader(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(v) ? v : null
}

export type StreamRoomContext = {
  ticketId: string
  ticketCode: string
  holderName: string
  eventId: string
  eventTitle: string
  eventSlug: string
  startDate: string
  endDate: string | null
  timezone: string | null
  organisationName: string | null
  geoAllow: string[]
  /** Present only when the decision is ok. */
  streamUrl: string | null
}

export type StreamAccessResult =
  | { ok: true; room: StreamRoomContext }
  | { ok: false; reason: StreamAccessRefusal; room: StreamRoomContext | null }

type Db = SupabaseClient<Database>

type TicketRow = {
  id: string
  ticket_code: string
  secret: string
  status: string
  holder_name: string | null
  holder_email: string
  event: {
    id: string
    title: string
    slug: string
    start_date: string
    end_date: string | null
    timezone: string | null
    event_type: 'in_person' | 'virtual' | 'hybrid'
    stream_geo_allow: string[] | null
    organisation: { name: string } | null
  } | null
  tier: { access_mode: 'in_person' | 'virtual' } | null
}

/**
 * Gather the facts with the service role, decide, and only then read the vault.
 * `country` is the raw x-vercel-ip-country header value.
 */
export async function resolveStreamAccess(
  admin: Db,
  code: string,
  secret: string | null | undefined,
  country: string | null | undefined,
): Promise<StreamAccessResult> {
  const { data, error } = await admin
    .from('tickets')
    .select(
      'id, ticket_code, secret, status, holder_name, holder_email, event:events(id, title, slug, start_date, end_date, timezone, event_type, stream_geo_allow, organisation:organisations(name)), tier:ticket_tiers!tickets_ticket_tier_id_fkey(access_mode)',
    )
    .eq('ticket_code', code)
    .maybeSingle()
  if (error) {
    // Not swallowed: a database error must not read as "no such ticket".
    console.error('[stream-access] ticket read failed:', error)
  }
  const ticket = (data ?? null) as unknown as TicketRow | null

  const facts: StreamAccessFacts = {
    ticketFound: !!ticket,
    secretMatches: !!ticket && !!secret && ticket.secret === secret,
    ticketStatus: ticket?.status ?? null,
    eventType: ticket?.event?.event_type ?? null,
    tierAccessMode: ticket?.tier?.access_mode ?? null,
    geoAllow: ticket?.event?.stream_geo_allow ?? null,
    viewerCountry: viewerCountryFromHeader(country),
    hasLink: false,
  }

  // Everything before the vault read is decided first, so a refused viewer never
  // causes the link to be fetched at all.
  const pre = decideStreamAccess({ ...facts, hasLink: true })
  const room: StreamRoomContext | null =
    ticket && ticket.event
      ? {
          ticketId: ticket.id,
          ticketCode: ticket.ticket_code,
          holderName: ticket.holder_name?.trim() || 'Ticket holder',
          eventId: ticket.event.id,
          eventTitle: ticket.event.title,
          eventSlug: ticket.event.slug,
          startDate: ticket.event.start_date,
          endDate: ticket.event.end_date,
          timezone: ticket.event.timezone,
          organisationName: ticket.event.organisation?.name ?? null,
          geoAllow: normaliseCountryCodes(ticket.event.stream_geo_allow),
          streamUrl: null,
        }
      : null
  if (!pre.ok) return { ok: false, reason: pre.reason, room: pre.reason === 'not_found' || pre.reason === 'wrong_secret' ? null : room }
  if (!room) return { ok: false, reason: 'not_found', room: null }

  const url = await readStreamLink(admin, room.eventId)
  const final = decideStreamAccess({ ...facts, hasLink: !!url })
  if (!final.ok) return { ok: false, reason: final.reason, room }
  return { ok: true, room: { ...room, streamUrl: url } }
}
