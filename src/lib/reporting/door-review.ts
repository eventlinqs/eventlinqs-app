import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { earliestScanPerTicket } from './ordering'

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
  id: string
  ticket_id: string | null
  device_id: string | null
  device_scanned_at: string | null
  scanned_at: string
  scanned_offline: boolean
}

export async function fetchDoorReview(eventId: string): Promise<DoorReviewRow[]> {
  const admin = createAdminClient()

  /*
   * PAGED ON THE KEY, READ BACK IN SYNC ORDER. Both reads here were unbounded,
   * and a busy door produces a scan row per tap: an event with more than a
   * thousand flagged scans showed the organiser an arbitrary thousand of them
   * and called it the review list. Paging needs a UNIQUE order, so this pages on
   * `id` and the sync order the panel reads in is restored afterwards.
   */
  const flagged = (await readEveryRow<FlaggedScan>('the door review list', (from, to) =>
    admin
      .from('ticket_scans')
      .select('id, ticket_id, result, device_id, device_scanned_at, scanned_at, ticket:tickets!ticket_scans_ticket_id_fkey(ticket_code, holder_name)')
      .eq('event_id', eventId)
      .eq('review_status', 'needs_review')
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: FlaggedScan[] | null; error: { message: string } | null }>,
  )).sort((a, b) => {
    const at = a.scanned_at ?? ''
    const bt = b.scanned_at ?? ''
    if (at !== bt) return at < bt ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  if (flagged.length === 0) return []

  /*
   * THE WINNING ADMISSION, AND IT HAS TO BE THE FIRST ONE.
   *
   * This read had no `order by` at all and the loop below it kept the first row
   * it happened to meet. So which admission "won" was whichever one Postgres
   * returned first, which is undefined and could differ between two loads of
   * the same page: the organiser was shown a door and a time, presented as the
   * scan that beat this one, that need not have been either. The earliest sync
   * is now chosen explicitly, in `earliestScanPerTicket`, where it is pure and
   * tested against the rule in Scope v5 3.12.
   *
   * The `in` list is chunked for the same reason it is everywhere else: it is
   * bounded by BYTES, and one flagged scan per ticket means this list is as long
   * as the flagged list.
   */
  const ticketIds = [...new Set(flagged.map((f) => f.ticket_id).filter((id): id is string => Boolean(id)))]
  const admitted: WinningScan[] = []
  for (const chunk of chunkInFilterValues(ticketIds)) {
    const rows = await readEveryRow<WinningScan>('the winning admissions', (from, to) =>
      admin
        .from('ticket_scans')
        .select('id, ticket_id, device_id, device_scanned_at, scanned_at, scanned_offline')
        .eq('event_id', eventId)
        .eq('result', 'admitted')
        .in('ticket_id', chunk)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: WinningScan[] | null; error: { message: string } | null }>,
    )
    admitted.push(...rows)
  }
  const winners = earliestScanPerTicket(admitted)

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
