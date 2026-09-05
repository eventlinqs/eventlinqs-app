'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveEventAccess } from '@/lib/organisations/event-access'

export type ResolveReviewResult = { ok: true } | { ok: false; error: string }

/**
 * Close one flagged door scan (Scope v5 3.12: a second offline admission of the
 * same ticket "is flagged for manual review"). The event gate runs first, then
 * the RPC re-checks the caller against the scan's own event, so a scan id from
 * another organiser's event is refused twice.
 */
export async function resolveScanReview(eventId: string, scanId: string, note: string): Promise<ResolveReviewResult> {
  // Identity first, in this file, so the entry point audit can see it; the
  // shared gate then decides whether this person may act on this event.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in to review door scans.' }

  const access = await resolveEventAccess(eventId)
  if (!access.allowed) return { ok: false, error: 'You are not authorised to review scans for this event.' }

  const { data, error } = await supabase.rpc('resolve_scan_review', {
    p_scan_id: scanId,
    p_note: note.trim().slice(0, 500) || null,
  })
  if (error) {
    return {
      ok: false,
      error: error.message.includes('not_authorised')
        ? 'You are not authorised to review scans for this event.'
        : `The scan could not be marked resolved (${error.code || 'error'}: ${error.message}).`,
    }
  }
  if (data !== true) return { ok: false, error: 'That scan is not waiting for review any more.' }

  revalidatePath(`/dashboard/events/${eventId}/attendees`)
  return { ok: true }
}
