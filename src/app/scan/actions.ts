'use server'

import { createClient } from '@/lib/supabase/server'

export type ScanOutcome = {
  result: string
  holderName: string | null
  firstScannedAt: string | null
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
): Promise<ScanOutcome> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { result: 'error', holderName: null, firstScannedAt: null, error: 'Sign in to scan.' }
  }

  const { data, error } = await supabase.rpc('scan_ticket', {
    p_ticket_code: ticketCode,
    p_secret: secret,
    p_event_id: eventId,
  })

  if (error) {
    const message = error.message.includes('not_authorised')
      ? 'You are not authorised to scan for this event.'
      : 'Scan failed. Try again.'
    return { result: 'error', holderName: null, firstScannedAt: null, error: message }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    result: (row?.result as string) ?? 'invalid',
    holderName: (row?.holder_name as string | null) ?? null,
    firstScannedAt: (row?.first_scanned_at as string | null) ?? null,
  }
}
