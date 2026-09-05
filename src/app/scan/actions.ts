'use server'

import { createClient } from '@/lib/supabase/server'
import type { DoorTicketRecord, DoorTicketStatus, SyncOutcome } from '@/lib/scanner/door-types'
import { DOOR_SET_PAGE_SIZE } from '@/lib/scanner/door-types'
import { parseSyncOutcomes, type SyncPayloadItem } from '@/lib/scanner/door-sync'

export type ScanOutcome = {
  result: string
  holderName: string | null
  firstScannedAt: string | null
  /** Reserved seating: "Section Row A Seat 12" when the ticket carries a seat. */
  seatLabel: string | null
  error?: string
}

/**
 * Scans a ticket for an event via the scan_ticket RPC. Identity is the signed-in
 * staff user (cookie session), so auth.uid() inside the SECURITY DEFINER RPC is
 * the real scanner. The RPC enforces authorisation (event-org owner / member /
 * platform admin) and the admit-exactly-once invariant; this action just adapts
 * its result for the UI. A caller who is not authorised for the event gets a
 * clear error, never an admit.
 */
export async function scanTicket(
  eventId: string,
  ticketCode: string,
  secret: string,
  /** Which phone scanned (B2), so the other doors' live feed can say so. Never a credential. */
  deviceId: string | null = null,
): Promise<ScanOutcome> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { result: 'error', holderName: null, firstScannedAt: null, seatLabel: null, error: 'Sign in to scan.' }
  }

  const { data, error } = await supabase.rpc('scan_ticket', {
    p_ticket_code: ticketCode,
    p_secret: secret,
    p_event_id: eventId,
    p_device_id: deviceId ? deviceId.slice(0, 80) : undefined,
  })

  if (error) {
    const message = error.message.includes('not_authorised')
      ? 'You are not authorised to scan for this event.'
      : 'Scan failed. Try again.'
    return { result: 'error', holderName: null, firstScannedAt: null, seatLabel: null, error: message }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    result: (row?.result as string) ?? 'invalid',
    holderName: (row?.holder_name as string | null) ?? null,
    firstScannedAt: (row?.first_scanned_at as string | null) ?? null,
    seatLabel: (row?.seat_label as string | null) ?? null,
  }
}

/*
 * THE OFFLINE DOOR (Scope v5 3.12 and 3.13, 5 September 2026). Two more calls,
 * both through the session so the RPCs judge auth.uid() exactly as scan_ticket
 * does. Neither returns a secret: door_validation_set hands back a SHA-256 of
 * each ticket's secret and the device compares hashes.
 */

const TICKET_STATUSES: ReadonlySet<string> = new Set(['valid', 'scanned', 'refunded', 'void', 'transferred'])

/** One row of door_validation_set, as the migration declares it. */
type ValidationRow = {
  ticket_id: string | null
  ticket_code: string
  secret_hash: string
  status: string
  holder_name: string | null
  tier_name: string | null
  seat_label: string | null
  first_scanned_at: string | null
}

export type ValidationPage =
  | { ok: true; rows: DoorTicketRecord[]; serverNow: string; done: boolean }
  | { ok: false; error: string }

function refusal(error: { message: string; code?: string }, what: string): string {
  if (error.message.includes('not_authorised')) return 'You are not authorised to scan for this event.'
  if (error.message.includes('not_authenticated')) return 'Sign in to scan.'
  return `${what} (${error.code || 'error'}: ${error.message}).`
}

/**
 * One page of the door list, keyset-paged by ticket code. The device calls it
 * until a page comes back short of DOOR_SET_PAGE_SIZE.
 */
export async function downloadValidationPage(eventId: string, afterCode: string | null): Promise<ValidationPage> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in to download the door list.' }

  const { data, error } = await supabase.rpc('door_validation_set', {
    p_event_id: eventId,
    p_after_code: afterCode ?? undefined,
    p_limit: DOOR_SET_PAGE_SIZE,
  })
  if (error) return { ok: false, error: refusal(error, 'The door list could not be downloaded') }

  const rows: DoorTicketRecord[] = ((data ?? []) as ValidationRow[]).map((r) => ({
    ticketId: r.ticket_id ?? null,
    ticketCode: r.ticket_code,
    secretHash: r.secret_hash,
    status: (TICKET_STATUSES.has(r.status) ? r.status : 'void') as DoorTicketStatus,
    holderName: r.holder_name ?? null,
    tierName: r.tier_name ?? null,
    seatLabel: r.seat_label ?? null,
    firstScannedAt: r.first_scanned_at ?? null,
    admittedLocallyAt: null,
  }))
  return { ok: true, rows, serverNow: new Date().toISOString(), done: rows.length < DOOR_SET_PAGE_SIZE }
}

export type SyncAnswer =
  | { ok: true; outcomes: SyncOutcome[]; serverNow: string }
  | { ok: false; error: string }

/**
 * Reconcile a batch of device-judged scans. The RPC makes the decision (first
 * sync wins, the second is flagged); the answer is parsed strictly here so a
 * malformed one is an error the door can read, never a half-applied queue.
 */
export async function syncOfflineScans(eventId: string, scans: SyncPayloadItem[]): Promise<SyncAnswer> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in to sync the door.' }
  if (scans.length === 0) return { ok: true, outcomes: [], serverNow: new Date().toISOString() }

  const { data, error } = await supabase.rpc('sync_offline_scans', {
    p_event_id: eventId,
    p_scans: scans,
  })
  if (error) return { ok: false, error: refusal(error, 'The queued scans could not be synced') }

  try {
    return { ok: true, outcomes: parseSyncOutcomes(data), serverNow: new Date().toISOString() }
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError)
    console.error('[scan] sync_offline_scans returned an answer the door cannot read', { eventId, message })
    return { ok: false, error: `The server's sync answer could not be read (${message}).` }
  }
}
