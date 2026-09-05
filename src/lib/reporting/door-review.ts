import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE DOOR REVIEW LIST (Scope v5 3.12: "if two scanners validate the same
 * ticket offline, the first sync wins and the second is flagged for manual
 * review"). One row per flagged scan on the event, each beside the admission
 * that won, so the organiser can see which door let the second person in and
 * how long after the first.
 *
 * Data sovereignty, the same shape as attendees.ts: the CALLER has already
 * passed getOrganiserEvent (the shared access gate) before this runs, and this
 * reads with the service role only after that. It is never called for an event
 * the caller cannot manage.
 */

export type { DoorReviewRow } from './door-review-types'
import type { DoorReviewRow } from './door-review-types'

type FlaggedScan = {
  id: string
  ticket_id: string | null
  result: string
  device_id: string | null
  device_scanned_at: string | null
  scanned_at: string
  ticket: { ticket_code: string; holder_name: string | null } | null
}

type WinningScan = {
  ticket_id: string | null
  device_id: string | null
  device_scanned_at: string | null
  scanned_at: string
  scanned_offline: boolean
}

export async function fetchDoorReview(eventId: string): Promise<DoorReviewRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ticket_scans')
    .select('id, ticket_id, result, device_id, device_scanned_at, scanned_at, ticket:tickets!ticket_scans_ticket_id_fkey(ticket_code, holder_name)')
    .eq('event_id', eventId)
    .eq('review_status', 'needs_review')
    .order('scanned_at', { ascending: true })
  if (error) {
    throw new Error(`The door review list could not be read (${error.code}: ${error.message})`)
  }
  const flagged = (data ?? []) as unknown as FlaggedScan[]
  if (flagged.length === 0) return []

  const ticketIds = [...new Set(flagged.map((f) => f.ticket_id).filter((id): id is string => Boolean(id)))]
  const winners = new Map<string, WinningScan>()
  if (ticketIds.length > 0) {
    const { data: admitted, error: admittedError } = await admin
      .from('ticket_scans')
      .select('ticket_id, device_id, device_scanned_at, scanned_at, scanned_offline')
      .eq('event_id', eventId)
      .eq('result', 'admitted')
      .in('ticket_id', ticketIds)
    if (admittedError) {
      throw new Error(`The winning admissions could not be read (${admittedError.code}: ${admittedError.message})`)
    }
    for (const row of (admitted ?? []) as WinningScan[]) {
      if (row.ticket_id && !winners.has(row.ticket_id)) winners.set(row.ticket_id, row)
    }
  }

  return flagged.map((f) => {
    const winner = f.ticket_id ? winners.get(f.ticket_id) : undefined
    return {
      scanId: f.id,
      ticketCode: f.ticket?.ticket_code ?? null,
      holderName: f.ticket?.holder_name ?? null,
      result: f.result,
      deviceId: f.device_id,
      deviceScannedAt: f.device_scanned_at,
      syncedAt: f.scanned_at,
      winner: winner
        ? {
            deviceId: winner.device_id,
            // The winner's own clock when it said so, otherwise the server's record of it.
            at: winner.device_scanned_at ?? winner.scanned_at,
            scannedOffline: winner.scanned_offline,
          }
        : null,
    }
  })
}
