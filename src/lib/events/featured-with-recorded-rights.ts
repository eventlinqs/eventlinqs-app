/**
 * FEATURED THIS WEEK SHOWS A REAL PHOTOGRAPH WHOSE RIGHTS ARE ON RECORD, OR NOTHING (Lawal's order of 1 November
 * 2026, 11:01: "a 'Featured this week' row of Ledger cards for events with a real, rights recorded photo only (no
 * placeholder, the row left out if fewer than two)").
 *
 * Two photographs qualify:
 *   - an approved photograph of THE venue, which the card image chain only applies with its credit
 *     (src/lib/images/venue-photo-chain.ts sets image_credit);
 *   - the organiser's own cover where the database's rights record (public.event_image_rights, derived on every write,
 *     migration 20261029221501) reads organiser_authorised or separately_licensed.
 * Never: our typographic cover (original_design), a library photograph that is not of the night (platform_library),
 * an image with no rights on record (unrecorded), or a night with no image.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isComposedCover } from '@/lib/events/generated-cover-prefix'

const RECORDED = new Set(['organiser_authorised', 'separately_licensed'])
export const FEATURED_MINIMUM = 2

type Candidate = { readonly id: string; readonly cover_image_url: string | null; readonly image_credit?: string | null }

export function featuredWithRecordedRights<T extends Candidate>(
  events: readonly T[],
  coverRights: ReadonlyMap<string, string>,
  places: number,
): T[] {
  const picked = events
    .filter((e) => {
      if (!e.cover_image_url || isComposedCover(e.cover_image_url)) return false
      if (e.image_credit) return true
      return RECORDED.has(coverRights.get(e.id) ?? '')
    })
    .slice(0, places)
  return picked.length >= FEATURED_MINIMUM ? picked : []
}

/**
 * The rights state of each night's COVER, read with the service role (the table is granted to it alone). A failed read
 * throws: a Featured row is never filled by guessing that an image is cleared.
 */
export async function readCoverRights(admin: SupabaseClient, eventIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (eventIds.length === 0) return out
  const { data, error } = await admin
    .from('event_image_rights')
    .select('event_id, rights_state')
    .eq('image_role', 'cover')
    .in('event_id', [...eventIds])
  if (error) throw new Error(`the cover rights could not be read: ${error.message}`)
  for (const r of (data ?? []) as { event_id: string; rights_state: string }[]) out.set(r.event_id, r.rights_state)
  return out
}
